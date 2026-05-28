import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  CodexPromptInferenceInput,
  CodexPromptInferenceOutput,
  CodexPromptInferenceRunner
} from "../domain/types.js";
import type {
  CodexAgentStatus,
  ImageContextResult,
  PromptInferenceConfidence,
  PromptInferenceResultData,
  PromptInferenceTextPair
} from "../../shared/types.js";

const CODEX_EXEC_MAX_BUFFER = 1024 * 1024;
const CODEX_HEALTH_TIMEOUT_MS = 8_000;

interface ExecTextResult {
  stderr: string;
  stdout: string;
}

export class CodexCliPromptInferenceRunner implements CodexPromptInferenceRunner {
  private executablePath: string | null = null;

  async checkHealth(): Promise<CodexAgentStatus> {
    const checkedAt = new Date().toISOString();
    try {
      const executablePath = await this.resolveExecutablePath();
      const [version, help] = await Promise.all([
        execFileText(executablePath, ["--version"], CODEX_HEALTH_TIMEOUT_MS),
        execFileText(executablePath, ["exec", "--help"], CODEX_HEALTH_TIMEOUT_MS)
      ]);
      const helpText = `${help.stdout}\n${help.stderr}`;
      const supportsImages = helpText.includes("--image");

      return {
        available: supportsImages,
        checkedAt,
        executablePath,
        version: firstLine(version.stdout || version.stderr),
        supportsImages,
        error: supportsImages ? null : "Installed Codex CLI does not support image input."
      };
    } catch (error) {
      return {
        available: false,
        checkedAt,
        executablePath: this.executablePath,
        version: null,
        supportsImages: false,
        error: error instanceof Error ? error.message : "Codex CLI is not available."
      };
    }
  }

  async inferPrompt(input: CodexPromptInferenceInput): Promise<CodexPromptInferenceOutput> {
    const executablePath = await this.resolveExecutablePath();
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "comate-codex-prompt-"));
    const schemaPath = path.join(workspaceDir, "prompt-inference.schema.json");
    const outputPath = path.join(workspaceDir, "prompt-inference.output.json");
    const requestedModel = process.env.COMATE_CODEX_MODEL?.trim() || null;

    try {
      await fs.writeFile(schemaPath, JSON.stringify(createPromptInferenceSchema()), "utf8");
      const args = buildCodexPromptInferenceArgs({
        imagePath: input.image.filePath,
        outputPath,
        prompt: buildCodexPromptInferencePrompt(input),
        requestedModel,
        schemaPath
      });

      const result = await execFileText(executablePath, args, input.timeoutMs);
      const outputText = await readCodexOutput(outputPath, result.stdout);
      const parsed = normalizeCodexOutput(parseJsonObject(outputText));
      return {
        confidence: parsed.confidence,
        model: requestedModel,
        result: {
          prompt: parsed.prompt,
          negativePrompt: parsed.negativePrompt,
          structure: parsed.structure
        }
      };
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  }

  private async resolveExecutablePath(): Promise<string> {
    if (this.executablePath) {
      return this.executablePath;
    }

    const configuredPath = process.env.COMATE_CODEX_BIN?.trim();
    if (configuredPath) {
      await assertExecutableExists(configuredPath);
      this.executablePath = configuredPath;
      return configuredPath;
    }

    const resolved = (await execFileText("/bin/zsh", ["-lc", "command -v codex"], CODEX_HEALTH_TIMEOUT_MS)).stdout.trim();
    if (!resolved) {
      throw new Error("Codex CLI was not found in PATH.");
    }

    this.executablePath = resolved;
    return resolved;
  }
}

export function buildCodexPromptInferenceArgs(options: {
  imagePath: string;
  outputPath: string;
  prompt: string;
  requestedModel: string | null;
  schemaPath: string;
}): string[] {
  const args = [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only"
  ];
  if (options.requestedModel) {
    args.push("--model", options.requestedModel);
  }
  args.push(
    "--image",
    options.imagePath,
    "--output-schema",
    options.schemaPath,
    "--output-last-message",
    options.outputPath,
    options.prompt
  );

  return args;
}

export function buildCodexPromptInferencePrompt(input: CodexPromptInferenceInput): string {
  const image = input.image;
  const context = formatContextForPrompt(input.context);
  const dimensions = image.width && image.height ? `${image.width}x${image.height}` : "unknown";

  return [
    "You are helping CoMate infer a useful image-generation prompt from a local image.",
    "This is an inferred prompt, not a recovered exact original prompt.",
    "Return only valid JSON that matches the provided schema.",
    "",
    "Requirements:",
    "- Provide both Chinese and English.",
    "- Write a standalone, production-ready image-generation prompt in each language.",
    "- Be visually faithful to the image: subject, scene, style, composition, lighting, color, mood, material, and technical rendering details.",
    "- Avoid claiming identity for any real person. Describe visible traits only when needed.",
    "- Keep negative prompts concise and useful. Use null if there is no useful negative prompt.",
    "- Do not run shell commands or inspect the filesystem. Use only the provided image and metadata.",
    "",
    "Image metadata:",
    `- File name: ${image.fileName}`,
    `- Thread title: ${image.threadName ?? "Untitled"}`,
    `- Dimensions: ${dimensions}`,
    `- Generated at: ${image.generatedAt ?? image.fileModifiedAt}`,
    "",
    "Nearby CoMate context, if available:",
    context
  ].join("\n");
}

function createPromptInferenceSchema(): unknown {
  const textPair = {
    type: "object",
    additionalProperties: false,
    required: ["zh", "en"],
    properties: {
      zh: { type: "string", minLength: 1 },
      en: { type: "string", minLength: 1 }
    }
  };
  const structure = {
    type: "object",
    additionalProperties: false,
    required: ["subject", "style", "composition", "lighting", "colorPalette", "technicalNotes"],
    properties: {
      subject: textPair,
      style: textPair,
      composition: textPair,
      lighting: textPair,
      colorPalette: textPair,
      technicalNotes: textPair
    }
  };

  return {
    type: "object",
    additionalProperties: false,
    required: ["confidence", "prompt", "negativePrompt", "structure"],
    properties: {
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      prompt: textPair,
      negativePrompt: {
        anyOf: [
          textPair,
          { type: "null" }
        ]
      },
      structure
    }
  };
}

function formatContextForPrompt(context: ImageContextResult | null): string {
  if (!context || context.messages.length === 0) {
    return "No nearby conversation context was cached for this image.";
  }

  return context.messages
    .slice(0, 8)
    .map((message) => {
      const timestamp = message.timestamp ? ` @ ${message.timestamp}` : "";
      return `${message.role}${timestamp}: ${trimForPrompt(message.text, 800)}`;
    })
    .join("\n\n");
}

function trimForPrompt(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

async function assertExecutableExists(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Configured Codex CLI was not found: ${filePath}`);
  }
}

function execFileText(file: string, args: string[], timeoutMs: number): Promise<ExecTextResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      {
        maxBuffer: CODEX_EXEC_MAX_BUFFER,
        timeout: timeoutMs,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr?.trim() || stdout?.trim() || error.message;
          reject(new Error(detail));
          return;
        }

        resolve({ stdout, stderr });
      }
    );
    // Codex exec treats an open stdin pipe as extra prompt input. Close it explicitly
    // so a prompt passed as an argv argument can run non-interactively.
    child.stdin?.end();
  });
}

async function readCodexOutput(outputPath: string, stdout: string): Promise<string> {
  try {
    const output = await fs.readFile(outputPath, "utf8");
    if (output.trim()) {
      return output;
    }
  } catch {
    // Older Codex versions may not write the output file when stdout already carries the final message.
  }
  return stdout;
}

function parseJsonObject(value: string): unknown {
  const trimmed = stripJsonCodeFence(value.trim());
  if (!trimmed) {
    throw new Error("Codex did not return a prompt inference.");
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    const embeddedJson = extractEmbeddedJsonObject(trimmed);
    if (embeddedJson) {
      return JSON.parse(embeddedJson) as unknown;
    }
    throw error;
  }
}

function stripJsonCodeFence(value: string): string {
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]!.trim() : value;
}

function extractEmbeddedJsonObject(value: string): string | null {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  return value.slice(start, end + 1);
}

function normalizeCodexOutput(value: unknown): PromptInferenceResultData & { confidence: PromptInferenceConfidence } {
  if (!isObject(value)) {
    throw new Error("Codex returned an invalid prompt inference.");
  }

  const confidence = normalizeConfidence(value.confidence);
  const prompt = normalizeTextPair(value.prompt, "prompt");
  const negativePrompt = value.negativePrompt === null || value.negativePrompt === undefined
    ? null
    : normalizeTextPair(value.negativePrompt, "negativePrompt");
  const structure = normalizeStructure(value.structure);

  return { confidence, prompt, negativePrompt, structure };
}

function normalizeStructure(value: unknown): PromptInferenceResultData["structure"] {
  if (!isObject(value)) {
    throw new Error("Codex returned an invalid prompt structure.");
  }

  return {
    subject: normalizeTextPair(value.subject, "subject"),
    style: normalizeTextPair(value.style, "style"),
    composition: normalizeTextPair(value.composition, "composition"),
    lighting: normalizeTextPair(value.lighting, "lighting"),
    colorPalette: normalizeTextPair(value.colorPalette, "colorPalette"),
    technicalNotes: normalizeTextPair(value.technicalNotes, "technicalNotes")
  };
}

function normalizeTextPair(value: unknown, fieldName: string): PromptInferenceTextPair {
  if (!isObject(value) || typeof value.zh !== "string" || typeof value.en !== "string") {
    throw new Error(`Codex returned an invalid ${fieldName}.`);
  }

  const zh = value.zh.trim();
  const en = value.en.trim();
  if (!zh || !en) {
    throw new Error(`Codex returned an empty ${fieldName}.`);
  }

  return { zh, en };
}

function normalizeConfidence(value: unknown): PromptInferenceConfidence {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "medium";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function firstLine(value: string): string | null {
  return value.trim().split(/\r?\n/)[0]?.trim() || null;
}

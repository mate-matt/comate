import fs from "node:fs/promises";
import path from "node:path";

import type { ImageContextRole } from "../../shared/types.js";
import type { SessionImageEvent, SessionLogInfo, SessionSummary, SessionTimelineEvent } from "../domain/types.js";
import { pathExists, walkFiles } from "../utils/fileSystem.js";
import { readJsonlObjects } from "../utils/jsonl.js";

interface SessionIndexLine {
  id?: string;
  thread_name?: string;
  updated_at?: string;
}

interface CodexSessionLogLine {
  timestamp?: string;
  payload?: {
    content?: unknown;
    type?: string;
    call_id?: string;
    item?: unknown;
    message?: unknown;
    role?: string;
    saved_path?: string;
    text?: unknown;
    revised_prompt?: string;
  };
}

export class CodexSessionRepository {
  constructor(
    private readonly sessionIndexPath: string,
    private readonly sessionsDir: string
  ) {}

  async readSessionIndex(): Promise<Map<string, SessionSummary>> {
    const sessions = new Map<string, SessionSummary>();

    await readJsonlObjects<SessionIndexLine>(this.sessionIndexPath, (line) => {
      if (!line.id) {
        return;
      }

      const previous = sessions.get(line.id);
      if (!previous || compareNullableIso(line.updated_at, previous.updatedAt) >= 0) {
        sessions.set(line.id, {
          id: line.id,
          threadName: line.thread_name ?? null,
          updatedAt: line.updated_at ?? null
        });
      }
    });

    return sessions;
  }

  async readSessionLogMap(): Promise<Map<string, SessionLogInfo>> {
    if (!(await pathExists(this.sessionsDir))) {
      return new Map();
    }

    const files = await walkFiles(this.sessionsDir, (filePath) => filePath.endsWith(".jsonl"));
    const results = new Map<string, SessionLogInfo>();

    await Promise.all(
      files.map(async (filePath) => {
        const sessionId = extractSessionIdFromRolloutPath(filePath);
        if (!sessionId) {
          return;
        }

        const stat = await fs.stat(filePath);
        const previous = results.get(sessionId);
        if (!previous || stat.mtimeMs >= previous.modifiedAtMs) {
          results.set(sessionId, {
            sessionId,
            filePath,
            modifiedAtMs: stat.mtimeMs
          });
        }
      })
    );

    return results;
  }

  async readImageEvents(sessionLogPath: string): Promise<SessionImageEvent[]> {
    const events: SessionImageEvent[] = [];

    await readJsonlObjects<CodexSessionLogLine>(
      sessionLogPath,
      (line) => {
        const payload = line.payload;
        if (payload?.type !== "image_generation_end") {
          return;
        }

        events.push({
          callId: payload.call_id ?? null,
          savedPath: payload.saved_path ?? null,
          timestamp: line.timestamp ?? null,
          revisedPrompt: payload.revised_prompt?.trim() || null
        });
      },
      (rawLine) => rawLine.includes("\"image_generation_end\"")
    );

    return events;
  }

  async readSessionTimeline(sessionLogPath: string): Promise<SessionTimelineEvent[]> {
    const events: SessionTimelineEvent[] = [];

    await readJsonlObjects<CodexSessionLogLine>(sessionLogPath, (line) => {
      const imageEvent = toImageEvent(line);
      if (imageEvent) {
        events.push(imageEvent);
        return;
      }

      const messageEvent = toMessageEvent(line);
      if (messageEvent) {
        events.push(messageEvent);
      }
    });

    return events;
  }
}

export function extractSessionIdFromRolloutPath(filePath: string): string | null {
  const fileName = path.basename(filePath);
  const match = fileName.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i);
  return match?.[1] ?? null;
}

function compareNullableIso(a: string | undefined | null, b: string | undefined | null): number {
  if (!a && !b) {
    return 0;
  }
  if (!a) {
    return -1;
  }
  if (!b) {
    return 1;
  }
  return new Date(a).getTime() - new Date(b).getTime();
}

function toImageEvent(line: CodexSessionLogLine): SessionTimelineEvent | null {
  const payload = line.payload;
  if (payload?.type !== "image_generation_end") {
    return null;
  }

  return {
    kind: "image",
    callId: payload.call_id ?? null,
    savedPath: payload.saved_path ?? null,
    timestamp: line.timestamp ?? null,
    revisedPrompt: payload.revised_prompt?.trim() || null
  };
}

function toMessageEvent(line: CodexSessionLogLine): SessionTimelineEvent | null {
  const payload = line.payload;
  if (!payload) {
    return null;
  }

  const role = readMessageRole(payload);
  if (!role) {
    return null;
  }

  const text = readMessageText(payload);
  if (!text) {
    return null;
  }

  return {
    kind: "message",
    role,
    text,
    timestamp: line.timestamp ?? null
  };
}

function readMessageRole(payload: NonNullable<CodexSessionLogLine["payload"]>): ImageContextRole | null {
  const rawRole =
    readNestedString(payload, ["role"]) ??
    readNestedString(payload, ["message", "role"]) ??
    readNestedString(payload, ["item", "role"]);
  const roleFromType =
    payload.type === "user_message"
      ? "user"
      : payload.type === "assistant_message"
        ? "assistant"
        : payload.type === "system_message"
          ? "system"
          : payload.type === "tool_message" || payload.type === "tool_result" || payload.type === "function_call_output"
            ? "tool"
            : null;
  return normalizeRole(rawRole ?? roleFromType);
}

function readMessageText(payload: NonNullable<CodexSessionLogLine["payload"]>): string | null {
  return (
    extractText(payload.text) ??
    extractText(payload.content) ??
    extractText(readNestedValue(payload, ["message", "content"])) ??
    extractText(readNestedValue(payload, ["message", "text"])) ??
    extractText(readNestedValue(payload, ["item", "content"])) ??
    extractText(readNestedValue(payload, ["item", "text"]))
  );
}

function normalizeRole(value: string | null | undefined): ImageContextRole | null {
  if (value === "user" || value === "assistant" || value === "system" || value === "tool") {
    return value;
  }
  if (value === "developer") {
    return "system";
  }
  if (value === "function") {
    return "tool";
  }
  return null;
}

function extractText(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeText(value);
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object") {
          return (
            extractText(readNestedValue(item, ["text"])) ??
            extractText(readNestedValue(item, ["content"])) ??
            extractText(readNestedValue(item, ["parts"]))
          );
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));
    return normalizeText(parts.join("\n"));
  }

  if (value && typeof value === "object") {
    return (
      extractText(readNestedValue(value, ["text"])) ??
      extractText(readNestedValue(value, ["content"])) ??
      extractText(readNestedValue(value, ["parts"]))
    );
  }

  return null;
}

function normalizeText(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function readNestedString(value: unknown, pathParts: string[]): string | null {
  const nested = readNestedValue(value, pathParts);
  return typeof nested === "string" ? nested : null;
}

function readNestedValue(value: unknown, pathParts: string[]): unknown {
  let current = value;
  for (const part of pathParts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

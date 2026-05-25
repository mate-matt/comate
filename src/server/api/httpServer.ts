import fs from "node:fs";
import path from "node:path";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";

import type { DatePreset, ImageSearchParams, PromptState } from "../../shared/types.js";
import type { CodexPaths, ImageClipboardService, ImageIndexStore } from "../domain/types.js";
import type { IndexingService } from "../application/indexingService.js";
import type { CodexCapabilityScanner } from "../infrastructure/codexCapabilityScanner.js";
import { FileLauncher, type FileLaunchAction } from "../infrastructure/fileLauncher.js";
import { parseInteger, readJsonBody, sendError, sendJson } from "./httpUtils.js";
import { serveStaticFile } from "./staticAssets.js";

interface CreateServerOptions {
  capabilities: CodexCapabilityScanner;
  codexPaths: CodexPaths;
  imageClipboard?: ImageClipboardService;
  index: ImageIndexStore;
  indexing: IndexingService;
  launcher: FileLauncher;
  staticDir: string | null;
}

interface OpenBody {
  action?: FileLaunchAction;
}

interface CapabilityOpenBody extends OpenBody {
  path?: string;
}

export function createCoMateServer(options: CreateServerOptions): Server {
  return createServer((request, response) => {
    handleRequest(options, request, response).catch((error) => {
      const message = error instanceof Error ? error.message : "Unexpected server error.";
      sendError(response, 500, message);
    });
  });
}

async function handleRequest(
  options: CreateServerOptions,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (url.pathname.startsWith("/api")) {
    await handleApiRequest(options, request, response, url);
    return;
  }

  if (request.method === "GET" && options.staticDir && serveStaticFile(options.staticDir, url.pathname, response)) {
    return;
  }

  sendError(response, 404, "Not found.");
}

async function handleApiRequest(
  options: CreateServerOptions,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<void> {
  if (request.method === "GET" && url.pathname === "/api/health") {
    const status = await options.indexing.getStatus();
    sendJson(response, 200, {
      ok: true,
      indexed: options.index.count(),
      codexRoot: options.codexPaths.codexRoot,
      generatedImagesDir: options.codexPaths.generatedImagesDir,
      indexingState: status.indexing.state,
      targetApp: status.targetApp,
      localOnly: status.localOnly
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/status") {
    sendJson(response, 200, await options.indexing.getStatus());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/reindex") {
    const result = await options.indexing.reindex();
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/capabilities") {
    sendJson(response, 200, await options.capabilities.scan());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/capabilities/summary") {
    const capabilities = await options.capabilities.scan();
    sendJson(response, 200, capabilities.summary);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/capabilities/rescan") {
    sendJson(response, 200, await options.capabilities.scan());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/capabilities/open") {
    const body = await readJsonBody<CapabilityOpenBody>(request);
    if (body.action !== "openFile" && body.action !== "revealFile") {
      sendError(response, 400, "Unsupported open action.");
      return;
    }
    if (!body.path || !isAllowedCapabilityPath(body.path, options.codexPaths.codexRoot, process.cwd())) {
      sendError(response, 403, "Path is outside the allowed Codex workspace.");
      return;
    }

    options.launcher.open(body.path, body.action);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/images") {
    sendJson(response, 200, options.index.search(readSearchParams(url)));
    return;
  }

  const imageFileMatch = url.pathname.match(/^\/api\/images\/([^/]+)\/file$/);
  if (request.method === "GET" && imageFileMatch) {
    await sendImageFile(options.index, decodeURIComponent(imageFileMatch[1]!), response);
    return;
  }

  const imageOpenMatch = url.pathname.match(/^\/api\/images\/([^/]+)\/open$/);
  if (request.method === "POST" && imageOpenMatch) {
    const body = await readJsonBody<OpenBody>(request);
    const action = body.action;
    if (action !== "openFile" && action !== "revealFile") {
      sendError(response, 400, "Unsupported open action.");
      return;
    }

    const record = options.index.getById(decodeURIComponent(imageOpenMatch[1]!));
    if (!record) {
      sendError(response, 404, "Image not found.");
      return;
    }

    options.launcher.open(record.filePath, action);
    sendJson(response, 200, { ok: true });
    return;
  }

  const imageCopyMatch = url.pathname.match(/^\/api\/images\/([^/]+)\/copy$/);
  if (request.method === "POST" && imageCopyMatch) {
    if (!options.imageClipboard) {
      sendError(response, 501, "Native image clipboard is not available.");
      return;
    }

    const record = options.index.getById(decodeURIComponent(imageCopyMatch[1]!));
    if (!record) {
      sendError(response, 404, "Image not found.");
      return;
    }

    sendJson(response, 200, await options.imageClipboard.copyImageFile(record.filePath));
    return;
  }

  const imageMatch = url.pathname.match(/^\/api\/images\/([^/]+)$/);
  if (request.method === "GET" && imageMatch) {
    const record = options.index.getById(decodeURIComponent(imageMatch[1]!));
    if (!record) {
      sendError(response, 404, "Image not found.");
      return;
    }

    sendJson(response, 200, record);
    return;
  }

  sendError(response, 404, "Not found.");
}

function readSearchParams(url: URL): ImageSearchParams {
  const datePreset = readEnum<DatePreset>(url.searchParams.get("datePreset"), ["all", "today", "week", "month"], "all");
  const promptState = readEnum<PromptState>(
    url.searchParams.get("promptState"),
    ["all", "withPrompt", "withoutPrompt"],
    "all"
  );

  return {
    query: url.searchParams.get("query") ?? undefined,
    datePreset,
    promptState,
    sessionId: url.searchParams.get("sessionId") ?? undefined,
    limit: parseInteger(url.searchParams.get("limit"), 80),
    offset: parseInteger(url.searchParams.get("offset"), 0)
  };
}

async function sendImageFile(index: ImageIndexStore, id: string, response: ServerResponse): Promise<void> {
  const record = index.getById(id);
  if (!record) {
    sendError(response, 404, "Image not found.");
    return;
  }

  if (!fs.existsSync(record.filePath)) {
    sendError(response, 404, "Image file is missing.");
    return;
  }

  const stat = await fs.promises.stat(record.filePath);
  response.writeHead(200, {
    "content-type": getImageContentType(record.filePath),
    "content-length": stat.size,
    "cache-control": "private, max-age=60"
  });
  fs.createReadStream(record.filePath).pipe(response);
}

function getImageContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  return "image/png";
}

function readEnum<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && allowed.includes(value as T) ? (value as T) : fallback;
}

function isAllowedCapabilityPath(candidatePath: string, codexRoot: string, projectRoot: string): boolean {
  return isPathInside(candidatePath, codexRoot) || isPathInside(candidatePath, projectRoot);
}

function isPathInside(candidatePath: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

import fs from "node:fs";
import path from "node:path";
import type { ServerResponse } from "node:http";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

export function serveStaticFile(staticDir: string, requestPath: string, response: ServerResponse): boolean {
  const safePath = normalizeStaticPath(staticDir, requestPath);
  if (!safePath) {
    return false;
  }

  const filePath = fs.existsSync(safePath) && fs.statSync(safePath).isFile()
    ? safePath
    : path.join(staticDir, "index.html");

  if (!fs.existsSync(filePath)) {
    return false;
  }

  response.writeHead(200, {
    "content-type": CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream"
  });
  fs.createReadStream(filePath).pipe(response);
  return true;
}

export function normalizeStaticPath(staticDir: string, requestPath: string): string | null {
  const decodedPath = safeDecodePath(requestPath);
  if (decodedPath === null) {
    return null;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const resolved = path.resolve(staticDir, relativePath);
  const root = path.resolve(staticDir);
  const relativeToRoot = path.relative(root, resolved);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    return null;
  }

  return resolved;
}

function safeDecodePath(requestPath: string): string | null {
  try {
    return decodeURIComponent(requestPath.split("?")[0] ?? "/");
  } catch {
    return null;
  }
}

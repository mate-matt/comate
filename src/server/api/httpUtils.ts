import type { IncomingMessage, ServerResponse } from "node:http";

import type { ApiErrorResponse } from "../../shared/types.js";

export function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(value));
}

export function sendError(response: ServerResponse, statusCode: number, message: string): void {
  sendJson(response, statusCode, { error: message } satisfies ApiErrorResponse);
}

export async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (Buffer.concat(chunks).byteLength > 128 * 1024) {
      throw new Error("Request body is too large.");
    }
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

export function parseInteger(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

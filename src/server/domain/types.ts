import type { ImageRecord } from "../../shared/types.js";

export interface CodexPaths {
  codexRoot: string;
  generatedImagesDir: string;
  sessionIndexPath: string;
  sessionsDir: string;
  databasePath: string;
}

export interface ScannedImage {
  filePath: string;
  fileName: string;
  sessionId: string;
  fileModifiedAt: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  callId: string | null;
}

export interface SessionSummary {
  id: string;
  threadName: string | null;
  updatedAt: string | null;
}

export interface SessionImageEvent {
  callId: string | null;
  savedPath: string | null;
  timestamp: string | null;
  revisedPrompt: string | null;
}

export interface SessionLogInfo {
  sessionId: string;
  filePath: string;
  modifiedAtMs: number;
}

export interface ImageIndexStore {
  replaceAll(records: ImageRecord[]): void;
  search(params: import("../../shared/types.js").ImageSearchParams): import("../../shared/types.js").ImageSearchResult;
  getById(id: string): ImageRecord | null;
  count(): number;
  close(): void;
}

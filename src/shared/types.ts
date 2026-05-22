export type DatePreset = "all" | "today" | "week" | "month";
export type PromptState = "all" | "withPrompt" | "withoutPrompt";

export interface ImageRecord {
  id: string;
  filePath: string;
  fileName: string;
  sessionId: string;
  threadName: string | null;
  generatedAt: string | null;
  fileModifiedAt: string;
  prompt: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  callId: string | null;
  sessionPath: string | null;
  hasPrompt: boolean;
}

export interface SessionFacet {
  sessionId: string;
  threadName: string | null;
  count: number;
}

export interface ImageSearchParams {
  query?: string;
  datePreset?: DatePreset;
  promptState?: PromptState;
  sessionId?: string;
  limit?: number;
  offset?: number;
}

export interface ImageSearchResult {
  items: ImageRecord[];
  total: number;
  facets: {
    sessions: SessionFacet[];
    totalImages: number;
    withPrompt: number;
    withoutPrompt: number;
  };
}

export interface ReindexResult {
  indexed: number;
  scannedAt: string;
  durationMs: number;
}

export type CodexDesktopDataPath = "codexRoot" | "generatedImagesDir" | "sessionIndexPath" | "sessionsDir";

export interface CodexDesktopStatus {
  available: boolean;
  codexRoot: string;
  generatedImagesDir: string;
  sessionIndexPath: string;
  sessionsDir: string;
  existingPaths: CodexDesktopDataPath[];
  missingPaths: CodexDesktopDataPath[];
}

export type IndexingState = "idle" | "indexing" | "ready" | "error";

export interface IndexingStatus {
  state: IndexingState;
  indexed: number;
  scannedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

export interface RuntimeStatus {
  codexDesktop: CodexDesktopStatus;
  indexing: IndexingStatus;
  localOnly: true;
  targetApp: "Codex Desktop";
}

export interface ApiErrorResponse {
  error: string;
}

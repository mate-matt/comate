import type {
  CodexAgentStatus,
  ImageContextResult,
  ImageContextRole,
  ImageCopyResult,
  ImagePromptInferenceRecord,
  ImageRecord,
  IndexingProgress,
  PromptInferenceConfidence,
  PromptInferenceResultData
} from "../../shared/types.js";

export interface CodexPaths {
  codexRoot: string;
  generatedImagesDir: string;
  sessionIndexPath: string;
  sessionsDir: string;
  databasePath: string;
  thumbnailCacheDir: string;
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

export interface ScannedImageFile {
  filePath: string;
  fileName: string;
  sessionId: string;
  fileModifiedAt: string;
  sizeBytes: number;
  callId: string | null;
}

export type IndexingProgressReporter = (progress: IndexingProgress) => void;

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

export interface SessionMessageEvent {
  role: ImageContextRole;
  text: string;
  timestamp: string | null;
}

export type SessionTimelineEvent =
  | ({ kind: "image" } & SessionImageEvent)
  | ({ kind: "message" } & SessionMessageEvent);

export interface SessionLogInfo {
  sessionId: string;
  filePath: string;
  modifiedAtMs: number;
}

export interface ImageIndexStore {
  replaceAll(records: ImageRecord[]): void;
  syncRecords(records: ImageRecord[]): void;
  search(params: import("../../shared/types.js").ImageSearchParams): import("../../shared/types.js").ImageSearchResult;
  getById(id: string): ImageRecord | null;
  getImageContext(imageId: string): ImageContextResult | null;
  getPromptInference(imageId: string): ImagePromptInferenceRecord | null;
  listAll(): ImageRecord[];
  replaceImageContext(context: ImageContextResult): void;
  replaceImageContexts(contexts: ImageContextResult[]): void;
  replacePromptInference(inference: ImagePromptInferenceRecord): void;
  count(): number;
  close(): void;
}

export interface ImageClipboardService {
  copyImageFile(filePath: string): Promise<ImageCopyResult>;
}

export interface ImageThumbnail {
  filePath: string;
  mimeType: string;
}

export interface ImageThumbnailService {
  getThumbnail(record: ImageRecord): Promise<ImageThumbnail>;
}

export interface CodexPromptInferenceInput {
  context: ImageContextResult | null;
  image: ImageRecord;
  timeoutMs: number;
}

export interface CodexPromptInferenceOutput {
  confidence: PromptInferenceConfidence;
  model: string | null;
  result: PromptInferenceResultData;
}

export interface CodexPromptInferenceRunner {
  checkHealth(): Promise<CodexAgentStatus>;
  inferPrompt(input: CodexPromptInferenceInput): Promise<CodexPromptInferenceOutput>;
}

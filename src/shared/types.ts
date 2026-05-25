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
    last30Days: number;
    last7Days: number;
    today: number;
    totalImages: number;
    withPrompt: number;
    withoutPrompt: number;
  };
}

export interface ImageCopyResult {
  mimeType: string;
  native: boolean;
  size: number;
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

export type CapabilityKind = "skill" | "plugin" | "mcp" | "command" | "automation";
export type CapabilitySource = "user" | "system" | "plugin" | "project" | "runtime";
export type CapabilityStatus = "enabled" | "disabled" | "warning" | "unknown";
export type CapabilityIssueSeverity = "info" | "warning" | "error";
export type CapabilityDependencyKind =
  | "agents"
  | "app"
  | "assets"
  | "commands"
  | "config"
  | "mcp"
  | "references"
  | "scripts"
  | "skills"
  | "workspace";

export interface CapabilityIssue {
  code: string;
  message: string;
  severity: CapabilityIssueSeverity;
}

export interface CapabilityDependency {
  count?: number;
  kind: CapabilityDependencyKind;
  label: string;
  path?: string;
  status: "available" | "missing" | "unknown";
}

export interface CapabilityRecord {
  id: string;
  name: string;
  kind: CapabilityKind;
  source: CapabilitySource;
  status: CapabilityStatus;
  description: string | null;
  path: string | null;
  origin: string;
  trigger: string | null;
  updatedAt: string | null;
  issues: CapabilityIssue[];
  dependencies: CapabilityDependency[];
  metadata: Record<string, string>;
}

export interface CapabilitySummary {
  total: number;
  issueCount: number;
  byKind: Record<CapabilityKind, number>;
  bySource: Record<CapabilitySource, number>;
  byStatus: Record<CapabilityStatus, number>;
}

export interface CapabilityScanResult {
  items: CapabilityRecord[];
  issues: CapabilityIssue[];
  scannedAt: string;
  summary: CapabilitySummary;
}

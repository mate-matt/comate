import type { RuntimeStatus, CodexDesktopStatus, IndexingProgress, IndexingStatus, ReindexResult } from "../../shared/types.js";
import type { LibraryService } from "./libraryService.js";

type CodexDesktopStatusReader = () => Promise<CodexDesktopStatus>;

export class IndexingService {
  private activeRun: Promise<ReindexResult> | null = null;
  private codexDesktopStatus: CodexDesktopStatus | null = null;
  private readonly indexingStatus: IndexingStatus = {
    state: "idle",
    indexed: 0,
    scannedAt: null,
    durationMs: null,
    error: null,
    progress: createProgress("idle", 0, 0)
  };

  constructor(
    private readonly library: LibraryService,
    private readonly readCodexDesktopStatus: CodexDesktopStatusReader
  ) {}

  startInitialIndex(): Promise<ReindexResult> {
    return this.reindex().catch(() => createZeroReindexResult());
  }

  async reindex(): Promise<ReindexResult> {
    if (this.activeRun) {
      return this.activeRun;
    }

    this.activeRun = this.runReindex().finally(() => {
      this.activeRun = null;
    });

    return this.activeRun;
  }

  async getStatus(): Promise<RuntimeStatus> {
    const codexDesktop = this.codexDesktopStatus ?? (await this.refreshCodexDesktopStatus());

    return {
      codexDesktop,
      indexing: { ...this.indexingStatus, progress: { ...this.indexingStatus.progress } },
      localOnly: true,
      targetApp: "Codex Desktop"
    };
  }

  private async runReindex(): Promise<ReindexResult> {
    const codexDesktop = await this.refreshCodexDesktopStatus();

    if (!codexDesktop.available) {
      const result = createZeroReindexResult();
      this.setReady(result);
      return result;
    }

    this.indexingStatus.state = "indexing";
    this.indexingStatus.error = null;
    this.indexingStatus.progress = createProgress("scanning", 0, 0);

    try {
      const result = await this.library.rebuildIndex((progress) => {
        this.indexingStatus.progress = { ...progress };
      });
      this.setReady(result);
      return result;
    } catch (error) {
      this.indexingStatus.state = "error";
      this.indexingStatus.error = error instanceof Error ? error.message : "Indexing failed.";
      this.indexingStatus.progress = createProgress("idle", 0, 0);
      throw error;
    }
  }

  private async refreshCodexDesktopStatus(): Promise<CodexDesktopStatus> {
    this.codexDesktopStatus = await this.readCodexDesktopStatus();
    return this.codexDesktopStatus;
  }

  private setReady(result: ReindexResult): void {
    this.indexingStatus.state = "ready";
    this.indexingStatus.indexed = result.indexed;
    this.indexingStatus.scannedAt = result.scannedAt;
    this.indexingStatus.durationMs = result.durationMs;
    this.indexingStatus.error = null;
    this.indexingStatus.progress = createProgress("ready", result.indexed, result.indexed);
  }
}

function createZeroReindexResult(): ReindexResult {
  return {
    indexed: 0,
    scannedAt: new Date().toISOString(),
    durationMs: 0
  };
}

function createProgress(phase: IndexingProgress["phase"], processed: number, total: number): IndexingProgress {
  return { phase, processed, total };
}

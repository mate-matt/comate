import crypto from "node:crypto";

import type { ImageContextResult, ImagePromptSource, ImageRecord, ReindexResult } from "../../shared/types.js";
import type {
  ImageIndexStore,
  IndexingProgressReporter,
  ScannedImageFile,
  SessionImageEvent,
  SessionTimelineEvent
} from "../domain/types.js";
import { CodexImageScanner } from "../infrastructure/codexImageScanner.js";
import { CodexSessionRepository } from "../infrastructure/codexSessionRepository.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import { buildImageContext } from "./imageContextService.js";

const RECORD_LINK_CONCURRENCY = 16;

interface LibraryIndexBuildResult {
  contexts: ImageContextResult[];
  records: ImageRecord[];
}

interface PromptResolution {
  capturedAt: string | null;
  prompt: string | null;
  source: ImagePromptSource;
}

export class LibraryService {
  constructor(
    private readonly scanner: CodexImageScanner,
    private readonly sessions: CodexSessionRepository,
    private readonly index: ImageIndexStore
  ) {}

  async rebuildIndex(onProgress?: IndexingProgressReporter): Promise<ReindexResult> {
    const startedAt = Date.now();
    const { contexts, records } = await this.buildImageIndex(onProgress);
    const writeTotal = records.length + contexts.length;
    let written = 0;
    onProgress?.({ phase: "writing", processed: written, total: writeTotal });
    this.index.syncRecords(records);
    written = records.length;
    onProgress?.({ phase: "writing", processed: written, total: writeTotal });

    if (contexts.length > 0) {
      this.index.replaceImageContexts(contexts);
      written += contexts.length;
    }
    onProgress?.({ phase: "writing", processed: written, total: writeTotal });

    return {
      indexed: records.length,
      scannedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt
    };
  }

  async buildImageRecords(onProgress?: IndexingProgressReporter): Promise<ImageRecord[]> {
    return (await this.buildImageIndex(onProgress)).records;
  }

  private async buildImageIndex(onProgress?: IndexingProgressReporter): Promise<LibraryIndexBuildResult> {
    const [imageFiles, sessionIndex, sessionLogMap] = await Promise.all([
      this.scanner.scanFiles(onProgress),
      this.sessions.readSessionIndex(),
      this.sessions.readSessionLogMap()
    ]);

    const capturedAt = new Date().toISOString();
    const timelineCache = new Map<string, Promise<SessionTimelineEvent[]>>();
    const existingByPath = new Map(this.index.listAll().map((record) => [record.filePath, record]));

    const getTimeline = async (sessionId: string): Promise<SessionTimelineEvent[]> => {
      const logInfo = sessionLogMap.get(sessionId);
      if (!logInfo) {
        return [];
      }

      if (!timelineCache.has(sessionId)) {
        timelineCache.set(sessionId, this.sessions.readSessionTimeline(logInfo.filePath));
      }

      return timelineCache.get(sessionId)!;
    };

    let processed = 0;
    onProgress?.({ phase: "linking", processed, total: imageFiles.length });

    const entries = await mapWithConcurrency(imageFiles, RECORD_LINK_CONCURRENCY, async (image) => {
      const summary = sessionIndex.get(image.sessionId);
      const logInfo = sessionLogMap.get(image.sessionId);
      const existing = existingByPath.get(image.filePath);
      const timeline = await getTimeline(image.sessionId);
      const event = findMatchingEvent(image.filePath, image.callId, timeline.filter(isImageTimelineEvent));
      const prompt = resolvePrompt(event, existing, capturedAt);
      const imageId = existing?.id ?? makeImageId(image.filePath);

      if (existing && isUnchangedImage(existing, image)) {
        const record = {
          ...existing,
          fileName: image.fileName,
          sessionId: image.sessionId,
          threadName: summary?.threadName ?? existing.threadName,
          generatedAt: event?.timestamp ?? existing.generatedAt ?? image.fileModifiedAt,
          fileModifiedAt: image.fileModifiedAt,
          prompt: prompt.prompt,
          promptSource: prompt.source,
          promptCapturedAt: prompt.capturedAt,
          sizeBytes: image.sizeBytes,
          callId: image.callId ?? event?.callId ?? existing.callId,
          sessionPath: logInfo?.filePath ?? existing.sessionPath,
          hasPrompt: Boolean(prompt.prompt)
        } satisfies ImageRecord;

        processed += 1;
        onProgress?.({ phase: "linking", processed, total: imageFiles.length });
        return { context: buildContextIfLive(record, timeline, capturedAt), record };
      }

      const imageWithDimensions = await this.scanner.withDimensions(image);

      const record = {
        id: imageId,
        filePath: image.filePath,
        fileName: imageWithDimensions.fileName,
        sessionId: imageWithDimensions.sessionId,
        threadName: summary?.threadName ?? null,
        generatedAt: event?.timestamp ?? existing?.generatedAt ?? image.fileModifiedAt,
        fileModifiedAt: image.fileModifiedAt,
        prompt: prompt.prompt,
        promptSource: prompt.source,
        promptCapturedAt: prompt.capturedAt,
        width: imageWithDimensions.width,
        height: imageWithDimensions.height,
        sizeBytes: imageWithDimensions.sizeBytes,
        callId: image.callId ?? event?.callId ?? existing?.callId ?? null,
        sessionPath: logInfo?.filePath ?? existing?.sessionPath ?? null,
        hasPrompt: Boolean(prompt.prompt)
      } satisfies ImageRecord;

      processed += 1;
      onProgress?.({ phase: "linking", processed, total: imageFiles.length });
      return { context: buildContextIfLive(record, timeline, capturedAt), record };
    });

    return {
      records: entries.map((entry) => entry.record),
      contexts: entries.flatMap((entry) => (entry.context ? [entry.context] : []))
    };
  }
}

export function findMatchingEvent(
  filePath: string,
  callId: string | null,
  events: SessionImageEvent[]
): SessionImageEvent | null {
  const byPath = events.find((event) => event.savedPath === filePath);
  if (byPath) {
    return byPath;
  }

  if (callId) {
    return events.find((event) => event.callId === callId) ?? null;
  }

  return null;
}

function resolvePrompt(
  event: SessionImageEvent | null,
  existing: ImageRecord | undefined,
  capturedAt: string
): PromptResolution {
  if (event?.revisedPrompt) {
    return {
      capturedAt,
      prompt: event.revisedPrompt,
      source: "revised_prompt"
    };
  }

  if (existing?.prompt) {
    return {
      capturedAt: existing.promptCapturedAt,
      prompt: existing.prompt,
      source: "cached"
    };
  }

  return {
    capturedAt: null,
    prompt: null,
    source: "none"
  };
}

function buildContextIfLive(
  record: Pick<ImageRecord, "id" | "filePath" | "callId" | "generatedAt" | "fileModifiedAt">,
  timeline: SessionTimelineEvent[],
  capturedAt: string
): ImageContextResult | null {
  if (timeline.length === 0) {
    return null;
  }
  return buildImageContext(record, timeline, { capturedAt, source: "live_log" });
}

function isImageTimelineEvent(event: SessionTimelineEvent): event is Extract<SessionTimelineEvent, { kind: "image" }> {
  return event.kind === "image";
}

function makeImageId(filePath: string): string {
  return crypto.createHash("sha1").update(filePath).digest("hex");
}

function isUnchangedImage(existing: ImageRecord, image: ScannedImageFile): boolean {
  return existing.fileModifiedAt === image.fileModifiedAt && existing.sizeBytes === image.sizeBytes;
}

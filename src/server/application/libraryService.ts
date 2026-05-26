import crypto from "node:crypto";

import type { ImageRecord, ReindexResult } from "../../shared/types.js";
import type { ImageIndexStore, IndexingProgressReporter, ScannedImageFile, SessionImageEvent } from "../domain/types.js";
import { CodexImageScanner } from "../infrastructure/codexImageScanner.js";
import { CodexSessionRepository } from "../infrastructure/codexSessionRepository.js";
import { mapWithConcurrency } from "../utils/concurrency.js";

const RECORD_LINK_CONCURRENCY = 16;

export class LibraryService {
  constructor(
    private readonly scanner: CodexImageScanner,
    private readonly sessions: CodexSessionRepository,
    private readonly index: ImageIndexStore
  ) {}

  async rebuildIndex(onProgress?: IndexingProgressReporter): Promise<ReindexResult> {
    const startedAt = Date.now();
    const records = await this.buildImageRecords(onProgress);
    onProgress?.({ phase: "writing", processed: 0, total: records.length });
    this.index.syncRecords(records);
    onProgress?.({ phase: "writing", processed: records.length, total: records.length });

    return {
      indexed: records.length,
      scannedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt
    };
  }

  async buildImageRecords(onProgress?: IndexingProgressReporter): Promise<ImageRecord[]> {
    const [imageFiles, sessionIndex, sessionLogMap] = await Promise.all([
      this.scanner.scanFiles(onProgress),
      this.sessions.readSessionIndex(),
      this.sessions.readSessionLogMap()
    ]);

    const eventCache = new Map<string, Promise<SessionImageEvent[]>>();
    const existingByPath = new Map(this.index.listAll().map((record) => [record.filePath, record]));

    const getEvents = async (sessionId: string): Promise<SessionImageEvent[]> => {
      const logInfo = sessionLogMap.get(sessionId);
      if (!logInfo) {
        return [];
      }

      if (!eventCache.has(sessionId)) {
        eventCache.set(sessionId, this.sessions.readImageEvents(logInfo.filePath));
      }

      return eventCache.get(sessionId)!;
    };

    let processed = 0;
    onProgress?.({ phase: "linking", processed, total: imageFiles.length });

    const records = await mapWithConcurrency(imageFiles, RECORD_LINK_CONCURRENCY, async (image) => {
      const summary = sessionIndex.get(image.sessionId);
      const logInfo = sessionLogMap.get(image.sessionId);
      const existing = existingByPath.get(image.filePath);
      if (existing && isUnchangedImage(existing, image)) {
        processed += 1;
        onProgress?.({ phase: "linking", processed, total: imageFiles.length });
        return {
          ...existing,
          fileName: image.fileName,
          sessionId: image.sessionId,
          threadName: summary?.threadName ?? existing.threadName,
          fileModifiedAt: image.fileModifiedAt,
          sizeBytes: image.sizeBytes,
          callId: image.callId ?? existing.callId,
          sessionPath: logInfo?.filePath ?? existing.sessionPath
        };
      }

      const imageWithDimensions = await this.scanner.withDimensions(image);
      const events = await getEvents(image.sessionId);
      const event = findMatchingEvent(image.filePath, image.callId, events);
      const prompt = event?.revisedPrompt ?? null;

      const record = {
        id: makeImageId(image.filePath),
        filePath: image.filePath,
        fileName: imageWithDimensions.fileName,
        sessionId: imageWithDimensions.sessionId,
        threadName: summary?.threadName ?? null,
        generatedAt: event?.timestamp ?? image.fileModifiedAt,
        fileModifiedAt: image.fileModifiedAt,
        prompt,
        width: imageWithDimensions.width,
        height: imageWithDimensions.height,
        sizeBytes: imageWithDimensions.sizeBytes,
        callId: image.callId ?? event?.callId ?? null,
        sessionPath: logInfo?.filePath ?? null,
        hasPrompt: Boolean(prompt)
      } satisfies ImageRecord;

      processed += 1;
      onProgress?.({ phase: "linking", processed, total: imageFiles.length });
      return record;
    });

    return records;
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

function makeImageId(filePath: string): string {
  return crypto.createHash("sha1").update(filePath).digest("hex");
}

function isUnchangedImage(existing: ImageRecord, image: ScannedImageFile): boolean {
  return existing.fileModifiedAt === image.fileModifiedAt && existing.sizeBytes === image.sizeBytes;
}

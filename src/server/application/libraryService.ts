import crypto from "node:crypto";

import type { ImageRecord, ReindexResult } from "../../shared/types.js";
import type { ImageIndexStore, SessionImageEvent } from "../domain/types.js";
import { CodexImageScanner } from "../infrastructure/codexImageScanner.js";
import { CodexSessionRepository } from "../infrastructure/codexSessionRepository.js";

export class LibraryService {
  constructor(
    private readonly scanner: CodexImageScanner,
    private readonly sessions: CodexSessionRepository,
    private readonly index: ImageIndexStore
  ) {}

  async rebuildIndex(): Promise<ReindexResult> {
    const startedAt = Date.now();
    const records = await this.buildImageRecords();
    this.index.replaceAll(records);

    return {
      indexed: records.length,
      scannedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt
    };
  }

  async buildImageRecords(): Promise<ImageRecord[]> {
    const [images, sessionIndex, sessionLogMap] = await Promise.all([
      this.scanner.scan(),
      this.sessions.readSessionIndex(),
      this.sessions.readSessionLogMap()
    ]);

    const eventCache = new Map<string, Promise<SessionImageEvent[]>>();

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

    const records: ImageRecord[] = [];

    for (const image of images) {
      const summary = sessionIndex.get(image.sessionId);
      const logInfo = sessionLogMap.get(image.sessionId);
      const events = await getEvents(image.sessionId);
      const event = findMatchingEvent(image.filePath, image.callId, events);
      const prompt = event?.revisedPrompt ?? null;

      records.push({
        id: makeImageId(image.filePath),
        filePath: image.filePath,
        fileName: image.fileName,
        sessionId: image.sessionId,
        threadName: summary?.threadName ?? null,
        generatedAt: event?.timestamp ?? image.fileModifiedAt,
        fileModifiedAt: image.fileModifiedAt,
        prompt,
        width: image.width,
        height: image.height,
        sizeBytes: image.sizeBytes,
        callId: image.callId ?? event?.callId ?? null,
        sessionPath: logInfo?.filePath ?? null,
        hasPrompt: Boolean(prompt)
      });
    }

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

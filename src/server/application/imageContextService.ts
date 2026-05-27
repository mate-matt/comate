import type { ImageContextMessage, ImageContextResult, ImageContextSource, ImageRecord } from "../../shared/types.js";
import type { SessionTimelineEvent } from "../domain/types.js";

export const DEFAULT_CONTEXT_BEFORE = 3;
export const DEFAULT_CONTEXT_AFTER = 2;

interface BuildImageContextOptions {
  after?: number;
  before?: number;
  capturedAt?: string;
  source?: ImageContextSource;
}

export function buildImageContext(
  image: Pick<ImageRecord, "id" | "filePath" | "callId" | "generatedAt" | "fileModifiedAt">,
  timeline: SessionTimelineEvent[],
  options: BuildImageContextOptions = {}
): ImageContextResult {
  const before = clampContextCount(options.before ?? DEFAULT_CONTEXT_BEFORE);
  const after = clampContextCount(options.after ?? DEFAULT_CONTEXT_AFTER);
  const source = options.source ?? "live_log";
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const anchor = findContextAnchor(image, timeline);

  if (anchor.index < 0) {
    return createUnavailableContext(image.id, anchor.timestamp);
  }

  const beforeMessages = timeline
    .slice(0, anchor.index)
    .filter(isMessageEvent)
    .slice(-before);
  const afterMessages = timeline
    .slice(anchor.index + 1)
    .filter(isMessageEvent)
    .slice(0, after);
  const messages = [...beforeMessages, ...afterMessages].map(
    (message, index): ImageContextMessage => ({
      position: index,
      role: message.role,
      text: message.text,
      timestamp: message.timestamp,
      source,
      capturedAt
    })
  );

  if (messages.length === 0) {
    return createUnavailableContext(image.id, anchor.timestamp);
  }

  return {
    imageId: image.id,
    anchorTimestamp: anchor.timestamp,
    status: "available",
    source,
    capturedAt,
    messages
  };
}

export function createUnavailableContext(imageId: string, anchorTimestamp: string | null = null): ImageContextResult {
  return {
    imageId,
    anchorTimestamp,
    status: "unavailable",
    source: null,
    capturedAt: null,
    messages: []
  };
}

function findContextAnchor(
  image: Pick<ImageRecord, "filePath" | "callId" | "generatedAt" | "fileModifiedAt">,
  timeline: SessionTimelineEvent[]
): { index: number; timestamp: string | null } {
  const exactIndex = timeline.findIndex(
    (event) =>
      event.kind === "image" &&
      (event.savedPath === image.filePath || (Boolean(image.callId) && event.callId === image.callId))
  );
  if (exactIndex >= 0) {
    const exactEvent = timeline[exactIndex]!;
    return { index: exactIndex, timestamp: exactEvent.timestamp };
  }

  const timestamp = image.generatedAt ?? image.fileModifiedAt;
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) {
    return { index: -1, timestamp };
  }

  let insertionIndex = -1;
  for (let index = 0; index < timeline.length; index += 1) {
    const eventTimestamp = timeline[index]?.timestamp;
    const eventMs = eventTimestamp ? Date.parse(eventTimestamp) : Number.NaN;
    if (!Number.isFinite(eventMs)) {
      continue;
    }
    if (eventMs <= timestampMs) {
      insertionIndex = index;
    } else {
      break;
    }
  }

  return { index: insertionIndex, timestamp };
}

function isMessageEvent(event: SessionTimelineEvent): event is Extract<SessionTimelineEvent, { kind: "message" }> {
  return event.kind === "message";
}

function clampContextCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(10, Math.max(0, Math.floor(value)));
}

import fs from "node:fs/promises";
import path from "node:path";

import type { SessionImageEvent, SessionLogInfo, SessionSummary } from "../domain/types.js";
import { pathExists, walkFiles } from "../utils/fileSystem.js";
import { readJsonlObjects } from "../utils/jsonl.js";

interface SessionIndexLine {
  id?: string;
  thread_name?: string;
  updated_at?: string;
}

interface CodexSessionLogLine {
  timestamp?: string;
  payload?: {
    type?: string;
    call_id?: string;
    saved_path?: string;
    revised_prompt?: string;
  };
}

export class CodexSessionRepository {
  constructor(
    private readonly sessionIndexPath: string,
    private readonly sessionsDir: string
  ) {}

  async readSessionIndex(): Promise<Map<string, SessionSummary>> {
    const sessions = new Map<string, SessionSummary>();

    await readJsonlObjects<SessionIndexLine>(this.sessionIndexPath, (line) => {
      if (!line.id) {
        return;
      }

      const previous = sessions.get(line.id);
      if (!previous || compareNullableIso(line.updated_at, previous.updatedAt) >= 0) {
        sessions.set(line.id, {
          id: line.id,
          threadName: line.thread_name ?? null,
          updatedAt: line.updated_at ?? null
        });
      }
    });

    return sessions;
  }

  async readSessionLogMap(): Promise<Map<string, SessionLogInfo>> {
    if (!(await pathExists(this.sessionsDir))) {
      return new Map();
    }

    const files = await walkFiles(this.sessionsDir, (filePath) => filePath.endsWith(".jsonl"));
    const results = new Map<string, SessionLogInfo>();

    await Promise.all(
      files.map(async (filePath) => {
        const sessionId = extractSessionIdFromRolloutPath(filePath);
        if (!sessionId) {
          return;
        }

        const stat = await fs.stat(filePath);
        const previous = results.get(sessionId);
        if (!previous || stat.mtimeMs >= previous.modifiedAtMs) {
          results.set(sessionId, {
            sessionId,
            filePath,
            modifiedAtMs: stat.mtimeMs
          });
        }
      })
    );

    return results;
  }

  async readImageEvents(sessionLogPath: string): Promise<SessionImageEvent[]> {
    const events: SessionImageEvent[] = [];

    await readJsonlObjects<CodexSessionLogLine>(
      sessionLogPath,
      (line) => {
        const payload = line.payload;
        if (payload?.type !== "image_generation_end") {
          return;
        }

        events.push({
          callId: payload.call_id ?? null,
          savedPath: payload.saved_path ?? null,
          timestamp: line.timestamp ?? null,
          revisedPrompt: payload.revised_prompt?.trim() || null
        });
      },
      (rawLine) => rawLine.includes("\"image_generation_end\"")
    );

    return events;
  }
}

export function extractSessionIdFromRolloutPath(filePath: string): string | null {
  const fileName = path.basename(filePath);
  const match = fileName.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i);
  return match?.[1] ?? null;
}

function compareNullableIso(a: string | undefined | null, b: string | undefined | null): number {
  if (!a && !b) {
    return 0;
  }
  if (!a) {
    return -1;
  }
  if (!b) {
    return 1;
  }
  return new Date(a).getTime() - new Date(b).getTime();
}

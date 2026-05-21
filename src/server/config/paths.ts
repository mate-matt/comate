import os from "node:os";
import path from "node:path";

import type { CodexPaths } from "../domain/types.js";

export function resolveCodexPaths(overrides: Partial<CodexPaths> = {}): CodexPaths {
  const codexRoot = overrides.codexRoot ?? process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
  const appDataDir = process.env.CODEX_MATE_HOME ?? path.join(os.homedir(), ".codex-mate");

  return {
    codexRoot,
    generatedImagesDir: overrides.generatedImagesDir ?? path.join(codexRoot, "generated_images"),
    sessionIndexPath: overrides.sessionIndexPath ?? path.join(codexRoot, "session_index.jsonl"),
    sessionsDir: overrides.sessionsDir ?? path.join(codexRoot, "sessions"),
    databasePath: overrides.databasePath ?? process.env.CODEX_MATE_DB ?? path.join(appDataDir, "codex-mate.sqlite")
  };
}

export const DEFAULT_WEB_PORT = Number(process.env.CODEX_MATE_WEB_PORT ?? 4388);
export const DEFAULT_API_PORT = Number(process.env.CODEX_MATE_API_PORT ?? 4389);

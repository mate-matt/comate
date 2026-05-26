import os from "node:os";
import path from "node:path";

import type { CodexPaths } from "../domain/types.js";

export function resolveCodexPaths(overrides: Partial<CodexPaths> = {}): CodexPaths {
  const codexRoot = overrides.codexRoot ?? process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
  const appDataDir = process.env.COMATE_HOME ?? path.join(os.homedir(), ".comate");

  return {
    codexRoot,
    generatedImagesDir: overrides.generatedImagesDir ?? path.join(codexRoot, "generated_images"),
    sessionIndexPath: overrides.sessionIndexPath ?? path.join(codexRoot, "session_index.jsonl"),
    sessionsDir: overrides.sessionsDir ?? path.join(codexRoot, "sessions"),
    databasePath: overrides.databasePath ?? process.env.COMATE_DB ?? path.join(appDataDir, "comate.sqlite"),
    thumbnailCacheDir: overrides.thumbnailCacheDir ?? process.env.COMATE_THUMBNAILS ?? path.join(appDataDir, "thumbnails")
  };
}

export const DEFAULT_WEB_PORT = Number(process.env.COMATE_WEB_PORT ?? 4388);
export const DEFAULT_API_PORT = Number(process.env.COMATE_API_PORT ?? 4389);

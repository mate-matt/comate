import type { CodexDesktopDataPath, CodexDesktopStatus } from "../../shared/types.js";
import type { CodexPaths } from "../domain/types.js";
import { pathExists } from "../utils/fileSystem.js";

const REQUIRED_PATHS: CodexDesktopDataPath[] = ["codexRoot", "generatedImagesDir", "sessionIndexPath", "sessionsDir"];

export async function detectCodexDesktopData(paths: CodexPaths): Promise<CodexDesktopStatus> {
  const checks: Record<CodexDesktopDataPath, Promise<boolean>> = {
    codexRoot: pathExists(paths.codexRoot),
    generatedImagesDir: pathExists(paths.generatedImagesDir),
    sessionIndexPath: pathExists(paths.sessionIndexPath),
    sessionsDir: pathExists(paths.sessionsDir)
  };

  const results = await Promise.all(REQUIRED_PATHS.map(async (key) => [key, await checks[key]] as const));
  const existingPaths = results.filter(([, exists]) => exists).map(([key]) => key);
  const missingPaths = results.filter(([, exists]) => !exists).map(([key]) => key);

  return {
    available: isCodexDesktopDataAvailable(existingPaths),
    codexRoot: paths.codexRoot,
    generatedImagesDir: paths.generatedImagesDir,
    sessionIndexPath: paths.sessionIndexPath,
    sessionsDir: paths.sessionsDir,
    existingPaths,
    missingPaths
  };
}

function isCodexDesktopDataAvailable(existingPaths: CodexDesktopDataPath[]): boolean {
  if (!existingPaths.includes("codexRoot")) {
    return false;
  }

  // Codex Desktop creates different parts of this tree as the user works.
  // Treat any known data child as evidence that this is a Codex Desktop data folder.
  return existingPaths.some((key) => key !== "codexRoot");
}

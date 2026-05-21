import path from "node:path";
import process from "node:process";

import { LibraryService } from "./application/libraryService.js";
import { DEFAULT_API_PORT, DEFAULT_WEB_PORT, resolveCodexPaths } from "./config/paths.js";
import { createCodexMateServer } from "./api/httpServer.js";
import { CodexImageScanner } from "./infrastructure/codexImageScanner.js";
import { CodexSessionRepository } from "./infrastructure/codexSessionRepository.js";
import { FileLauncher } from "./infrastructure/fileLauncher.js";
import { SqliteImageIndex } from "./infrastructure/sqliteImageIndex.js";

async function main(): Promise<void> {
  const codexPaths = resolveCodexPaths();
  const index = await SqliteImageIndex.open(codexPaths.databasePath);
  const library = new LibraryService(
    new CodexImageScanner(codexPaths.generatedImagesDir),
    new CodexSessionRepository(codexPaths.sessionIndexPath, codexPaths.sessionsDir),
    index
  );

  const initial = await library.rebuildIndex();
  const isDevApi = process.env.CODEX_MATE_DEV_API === "1";
  const port = isDevApi ? DEFAULT_API_PORT : DEFAULT_WEB_PORT;
  const staticDir = isDevApi ? null : path.resolve(process.cwd(), "dist-web");
  const server = createCodexMateServer({
    codexPaths,
    library,
    index,
    launcher: new FileLauncher(),
    staticDir
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Codex Mate indexed ${initial.indexed} image(s) in ${initial.durationMs}ms.`);
    console.log(`Codex Mate listening at http://127.0.0.1:${port}`);
  });

  const shutdown = (): void => {
    server.close(() => {
      index.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

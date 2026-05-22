import type { Server } from "node:http";

import { createCodexMateServer } from "../api/httpServer.js";
import { resolveCodexPaths } from "../config/paths.js";
import type { CodexPaths } from "../domain/types.js";
import { detectCodexDesktopData } from "../infrastructure/codexDesktopDetector.js";
import { CodexImageScanner } from "../infrastructure/codexImageScanner.js";
import { CodexSessionRepository } from "../infrastructure/codexSessionRepository.js";
import { FileLauncher } from "../infrastructure/fileLauncher.js";
import { SqliteImageIndex } from "../infrastructure/sqliteImageIndex.js";
import { IndexingService } from "./indexingService.js";
import { LibraryService } from "./libraryService.js";
import type { ReindexResult } from "../../shared/types.js";

export interface CodexMateRuntime {
  close: () => Promise<void>;
  initialIndex: Promise<ReindexResult>;
  port: number;
  server: Server;
  url: string;
}

export interface StartCodexMateRuntimeOptions {
  codexPaths?: Partial<CodexPaths>;
  host?: string;
  port: number;
  staticDir: string | null;
}

export async function startCodexMateRuntime(options: StartCodexMateRuntimeOptions): Promise<CodexMateRuntime> {
  const host = options.host ?? "127.0.0.1";
  const codexPaths = resolveCodexPaths(options.codexPaths);
  const index = await SqliteImageIndex.open(codexPaths.databasePath);
  const library = new LibraryService(
    new CodexImageScanner(codexPaths.generatedImagesDir),
    new CodexSessionRepository(codexPaths.sessionIndexPath, codexPaths.sessionsDir),
    index
  );
  const indexing = new IndexingService(library, () => detectCodexDesktopData(codexPaths));

  try {
    const initialIndex = indexing.startInitialIndex();
    const server = createCodexMateServer({
      codexPaths,
      index,
      indexing,
      launcher: new FileLauncher(),
      staticDir: options.staticDir
    });

    await listen(server, options.port, host);

    return {
      close: () => closeRuntime(server, index),
      initialIndex,
      port: options.port,
      server,
      url: `http://${host}:${options.port}`
    };
  } catch (error) {
    index.close();
    throw error;
  }
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function closeRuntime(server: Server, index: { close: () => void }): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      try {
        index.close();
      } catch (closeError) {
        reject(closeError);
        return;
      }

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

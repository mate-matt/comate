import type { Server } from "node:http";

import { createCoMateServer } from "../api/httpServer.js";
import { resolveCodexPaths } from "../config/paths.js";
import type { CodexPaths } from "../domain/types.js";
import { detectCodexDesktopData } from "../infrastructure/codexDesktopDetector.js";
import { CodexCapabilityScanner } from "../infrastructure/codexCapabilityScanner.js";
import { CodexImageScanner } from "../infrastructure/codexImageScanner.js";
import { CodexSessionRepository } from "../infrastructure/codexSessionRepository.js";
import { FileLauncher } from "../infrastructure/fileLauncher.js";
import { createDefaultImageThumbnailService } from "../infrastructure/imageThumbnailService.js";
import { SqliteImageIndex } from "../infrastructure/sqliteImageIndex.js";
import { IndexingService } from "./indexingService.js";
import { LibraryService } from "./libraryService.js";
import type { ReindexResult } from "../../shared/types.js";
import type { ImageClipboardService, ImageThumbnailService } from "../domain/types.js";

export interface CoMateRuntime {
  close: () => Promise<void>;
  codexPaths: CodexPaths;
  initialIndex: Promise<ReindexResult>;
  port: number;
  server: Server;
  url: string;
}

export interface StartCoMateRuntimeOptions {
  codexPaths?: Partial<CodexPaths>;
  host?: string;
  imageClipboard?: ImageClipboardService;
  thumbnails?: ImageThumbnailService;
  port: number;
  staticDir: string | null;
}

export async function startCoMateRuntime(options: StartCoMateRuntimeOptions): Promise<CoMateRuntime> {
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
    const server = createCoMateServer({
      capabilities: new CodexCapabilityScanner({ codexRoot: codexPaths.codexRoot, projectRoot: process.cwd() }),
      codexPaths,
      imageClipboard: options.imageClipboard,
      index,
      indexing,
      launcher: new FileLauncher(),
      staticDir: options.staticDir,
      thumbnails: options.thumbnails ?? createDefaultImageThumbnailService(codexPaths.thumbnailCacheDir)
    });

    await listen(server, options.port, host);

    return {
      close: () => closeRuntime(server, index),
      codexPaths,
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
    let finished = false;
    let indexClosed = false;
    const forceCloseTimer = setTimeout(() => {
      closeOpenHttpConnections(server);
    }, 1_000);

    const finish = (error?: Error): void => {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(forceCloseTimer);

      try {
        if (!indexClosed) {
          index.close();
          indexClosed = true;
        }
      } catch (closeError) {
        reject(closeError);
        return;
      }

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    server.close((error) => {
      finish(error ?? undefined);
    });

    closeIdleHttpConnections(server);
  });
}

function closeIdleHttpConnections(server: Server): void {
  const maybeClosable = server as Server & { closeIdleConnections?: () => void };
  maybeClosable.closeIdleConnections?.();
}

function closeOpenHttpConnections(server: Server): void {
  const maybeClosable = server as Server & { closeAllConnections?: () => void };
  maybeClosable.closeAllConnections?.();
}

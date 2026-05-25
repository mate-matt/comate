import { startCoMateRuntime, type CoMateRuntime } from "../../server/application/serverRuntime.js";
import { DEFAULT_WEB_PORT } from "../../server/config/paths.js";
import { findAvailablePort } from "../utils/port.js";
import { createNativeImageClipboard } from "./nativeImageClipboard.js";

export interface StartDesktopServerOptions {
  host?: string;
  preferredPort?: number;
  staticDir: string;
}

export async function startDesktopServer(options: StartDesktopServerOptions): Promise<CoMateRuntime> {
  const host = options.host ?? "127.0.0.1";
  const port = await findAvailablePort(options.preferredPort ?? DEFAULT_WEB_PORT, host);

  return startCoMateRuntime({
    host,
    imageClipboard: createNativeImageClipboard(),
    port,
    staticDir: options.staticDir
  });
}

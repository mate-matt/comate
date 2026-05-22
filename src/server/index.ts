import path from "node:path";
import process from "node:process";

import { startCodexMateRuntime } from "./application/serverRuntime.js";
import { DEFAULT_API_PORT, DEFAULT_WEB_PORT } from "./config/paths.js";

async function main(): Promise<void> {
  const isDevApi = process.env.CODEX_MATE_DEV_API === "1";
  const port = isDevApi ? DEFAULT_API_PORT : DEFAULT_WEB_PORT;
  const staticDir = isDevApi ? null : path.resolve(process.cwd(), "dist-web");

  const runtime = await startCodexMateRuntime({
    port,
    staticDir
  });

  console.log(`Codex Mate listening at ${runtime.url}`);
  runtime.initialIndex
    .then((result) => {
      console.log(`Codex Mate indexed ${result.indexed} image(s) in ${result.durationMs}ms.`);
    })
    .catch((error) => {
      console.error(error);
    });

  const shutdown = (): void => {
    runtime
      .close()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

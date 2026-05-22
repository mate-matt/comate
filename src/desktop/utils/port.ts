import net from "node:net";

export async function findAvailablePort(
  preferredPort: number,
  host = "127.0.0.1",
  maxAttempts = 50
): Promise<number> {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = preferredPort + offset;
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }

  throw new Error(`No available port found from ${preferredPort} to ${preferredPort + maxAttempts - 1}.`);
}

function isPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();

    probe.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
      } else {
        reject(error);
      }
    });

    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });

    probe.listen(port, host);
  });
}

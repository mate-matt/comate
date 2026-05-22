export interface WaitForHttpOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export async function waitForHttp(url: string, options: WaitForHttpOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const intervalMs = options.intervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() <= deadline) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(intervalMs, 1_000));

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }

    await sleep(intervalMs);
  }

  const reason = lastError instanceof Error ? ` ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${url}.${reason}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import fs from "node:fs";
import readline from "node:readline";

export async function readJsonlObjects<T>(
  filePath: string,
  onObject: (value: T, lineNumber: number) => void,
  shouldParseLine: (line: string) => boolean = () => true
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber += 1;
    const trimmed = line.trim();
    if (!trimmed || !shouldParseLine(trimmed)) {
      continue;
    }

    try {
      onObject(JSON.parse(trimmed) as T, lineNumber);
    } catch {
      // Codex session logs can contain very large generated-image payloads.
      // One corrupt line should not stop the whole local library refresh.
    }
  }
}

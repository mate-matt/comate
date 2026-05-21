import fs from "node:fs/promises";
import path from "node:path";

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function walkFiles(rootDir: string, accept: (filePath: string) => boolean): Promise<string[]> {
  const results: string[] = [];

  async function visit(current: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === ".DS_Store") {
        continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile() && accept(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  await visit(rootDir);
  return results;
}

export function isSupportedImagePath(filePath: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(filePath);
}

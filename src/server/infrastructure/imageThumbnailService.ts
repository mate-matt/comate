import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import type { ImageRecord } from "../../shared/types.js";
import type { ImageThumbnail, ImageThumbnailService } from "../domain/types.js";

const execFileAsync = promisify(execFile);
const THUMBNAIL_MAX_EDGE = 512;

export class SipsImageThumbnailService implements ImageThumbnailService {
  constructor(private readonly cacheDir: string) {}

  async getThumbnail(record: ImageRecord): Promise<ImageThumbnail> {
    const targetPath = getThumbnailCachePath(this.cacheDir, record);
    if (await pathExists(targetPath)) {
      return { filePath: targetPath, mimeType: "image/png" };
    }

    try {
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      await this.generatePngThumbnail(record.filePath, targetPath);
      await removeStaleThumbnails(this.cacheDir, record, targetPath);
      return { filePath: targetPath, mimeType: "image/png" };
    } catch {
      return {
        filePath: record.filePath,
        mimeType: getImageContentType(record.filePath)
      };
    }
  }

  private async generatePngThumbnail(sourcePath: string, targetPath: string): Promise<void> {
    const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp.png`;
    try {
      // `sips` is available on macOS, which is CoMate's current packaged target.
      // Keeping it behind this service makes the thumbnail pipeline replaceable.
      await execFileAsync("sips", ["-s", "format", "png", "-Z", String(THUMBNAIL_MAX_EDGE), sourcePath, "--out", tempPath], {
        timeout: 20_000
      });
      const stat = await fs.promises.stat(tempPath);
      if (!stat.isFile() || stat.size === 0) {
        throw new Error("Generated thumbnail is empty.");
      }
      await fs.promises.rename(tempPath, targetPath);
    } catch (error) {
      await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

export class PassthroughImageThumbnailService implements ImageThumbnailService {
  async getThumbnail(record: ImageRecord): Promise<ImageThumbnail> {
    return {
      filePath: record.filePath,
      mimeType: getImageContentType(record.filePath)
    };
  }
}

export function createDefaultImageThumbnailService(cacheDir: string): ImageThumbnailService {
  return process.platform === "darwin"
    ? new SipsImageThumbnailService(cacheDir)
    : new PassthroughImageThumbnailService();
}

export function getThumbnailCachePath(cacheDir: string, record: Pick<ImageRecord, "id" | "fileModifiedAt" | "sizeBytes">): string {
  const versionHash = crypto
    .createHash("sha1")
    .update(`${record.fileModifiedAt}:${record.sizeBytes}`)
    .digest("hex")
    .slice(0, 16);
  const shard = record.id.slice(0, 2) || "00";
  return path.join(cacheDir, shard, `${record.id}-${versionHash}.png`);
}

export function getImageContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  return "image/png";
}

async function removeStaleThumbnails(
  cacheDir: string,
  record: Pick<ImageRecord, "id" | "fileModifiedAt" | "sizeBytes">,
  activePath: string
): Promise<void> {
  const shardDir = path.dirname(getThumbnailCachePath(cacheDir, record));
  const prefix = `${record.id}-`;
  let entries: string[];
  try {
    entries = await fs.promises.readdir(shardDir);
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(prefix) && path.join(shardDir, entry) !== activePath)
      .map((entry) => fs.promises.rm(path.join(shardDir, entry), { force: true }).catch(() => undefined))
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

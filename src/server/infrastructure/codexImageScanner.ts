import fs from "node:fs/promises";
import path from "node:path";

import type { ScannedImage } from "../domain/types.js";
import { isSupportedImagePath, walkFiles } from "../utils/fileSystem.js";
import { readImageDimensions } from "../utils/imageDimensions.js";

export class CodexImageScanner {
  constructor(private readonly generatedImagesDir: string) {}

  async scan(): Promise<ScannedImage[]> {
    const files = await walkFiles(this.generatedImagesDir, isSupportedImagePath);
    const images = await Promise.all(files.map((filePath) => this.toScannedImage(filePath)));

    return images
      .filter((image): image is ScannedImage => image !== null)
      .sort((a, b) => b.fileModifiedAt.localeCompare(a.fileModifiedAt));
  }

  private async toScannedImage(filePath: string): Promise<ScannedImage | null> {
    const sessionId = path.basename(path.dirname(filePath));
    if (!isCodexSessionId(sessionId)) {
      return null;
    }

    const stat = await fs.stat(filePath);
    const dimensions = await readImageDimensions(filePath).catch(() => ({ width: null, height: null }));
    const fileName = path.basename(filePath);

    return {
      filePath,
      fileName,
      sessionId,
      fileModifiedAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
      width: dimensions.width,
      height: dimensions.height,
      callId: fileName.startsWith("ig_") ? path.parse(fileName).name : null
    };
  }
}

export function isCodexSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

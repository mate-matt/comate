import fs from "node:fs/promises";
import path from "node:path";

import type { IndexingProgressReporter, ScannedImage, ScannedImageFile } from "../domain/types.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import { isSupportedImagePath, walkFiles } from "../utils/fileSystem.js";
import { readImageDimensions } from "../utils/imageDimensions.js";

const DEFAULT_SCAN_CONCURRENCY = 24;

export class CodexImageScanner {
  constructor(
    private readonly generatedImagesDir: string,
    private readonly scanConcurrency = DEFAULT_SCAN_CONCURRENCY
  ) {}

  async scan(onProgress?: IndexingProgressReporter): Promise<ScannedImage[]> {
    const files = await this.scanFiles(onProgress);
    const images = await mapWithConcurrency(files, this.scanConcurrency, (file) => this.withDimensions(file));

    return images
      .filter((image): image is ScannedImage => image !== null)
      .sort((a, b) => b.fileModifiedAt.localeCompare(a.fileModifiedAt));
  }

  async scanFiles(onProgress?: IndexingProgressReporter): Promise<ScannedImageFile[]> {
    const files = await walkFiles(this.generatedImagesDir, isSupportedImagePath);
    let processed = 0;
    onProgress?.({ phase: "scanning", processed, total: files.length });
    const images = await mapWithConcurrency(files, this.scanConcurrency, async (filePath) => {
      const image = await this.toScannedImageFile(filePath);
      processed += 1;
      onProgress?.({ phase: "scanning", processed, total: files.length });
      return image;
    });

    return images
      .filter((image): image is ScannedImageFile => image !== null)
      .sort((a, b) => b.fileModifiedAt.localeCompare(a.fileModifiedAt));
  }

  async withDimensions(image: ScannedImageFile): Promise<ScannedImage> {
    const dimensions = await readImageDimensions(image.filePath).catch(() => ({ width: null, height: null }));
    return {
      ...image,
      width: dimensions.width,
      height: dimensions.height
    };
  }

  private async toScannedImageFile(filePath: string): Promise<ScannedImageFile | null> {
    const sessionId = path.basename(path.dirname(filePath));
    if (!isCodexSessionId(sessionId)) {
      return null;
    }

    const stat = await fs.stat(filePath);
    const fileName = path.basename(filePath);

    return {
      filePath,
      fileName,
      sessionId,
      fileModifiedAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
      callId: fileName.startsWith("ig_") ? path.parse(fileName).name : null
    };
  }
}

export function isCodexSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

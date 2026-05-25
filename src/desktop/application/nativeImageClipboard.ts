import fs from "node:fs/promises";
import path from "node:path";

import electron from "electron";

import type { ImageCopyResult } from "../../shared/types.js";
import type { ImageClipboardService } from "../../server/domain/types.js";

const { clipboard, nativeImage } = electron;

const SUPPORTED_CLIPBOARD_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export function createNativeImageClipboard(): ImageClipboardService {
  return {
    copyImageFile
  };
}

async function copyImageFile(filePath: string): Promise<ImageCopyResult> {
  assertSupportedImagePath(filePath);
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error("Image file is missing or empty.");
  }

  const image = nativeImage.createFromPath(filePath);
  if (image.isEmpty()) {
    throw new Error("Unable to read image for native clipboard.");
  }

  clipboard.writeImage(image);

  return {
    mimeType: getImageMimeType(filePath),
    native: true,
    size: stat.size
  };
}

function assertSupportedImagePath(filePath: string): void {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_CLIPBOARD_IMAGE_EXTENSIONS.has(ext)) {
    throw new Error("Unsupported image clipboard format.");
  }
}

function getImageMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  return "image/png";
}

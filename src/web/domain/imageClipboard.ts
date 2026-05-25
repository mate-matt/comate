import type { ImageCopyResult, ImageRecord } from "../../shared/types.js";
import { imageFileUrl } from "../api/client.js";

export type ImageClipboardCopyResult = ImageCopyResult;

export interface ImageClipboardRuntime {
  ClipboardItem: typeof ClipboardItem | null;
  clipboard: Pick<Clipboard, "write"> | null;
  fetch: typeof fetch | null;
  nativeCopyImage?: (image: ImageRecord) => Promise<ImageClipboardCopyResult>;
}

interface CopyShortcutEvent {
  altKey?: boolean;
  ctrlKey?: boolean;
  defaultPrevented?: boolean;
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: EventTarget | null;
}

export async function copyImageBinaryToClipboard(
  image: ImageRecord,
  runtime = getImageClipboardRuntime()
): Promise<ImageClipboardCopyResult> {
  const nativeAttempt = await tryNativeImageCopy(image, runtime);
  if (!nativeAttempt.caught) {
    return nativeAttempt.result;
  }

  if (!runtime.fetch) {
    if (nativeAttempt.error) {
      throw toError(nativeAttempt.error);
    }
    throw new Error("Image fetch is not available in this environment.");
  }

  if (!runtime.clipboard?.write || !runtime.ClipboardItem) {
    if (nativeAttempt.error) {
      throw toError(nativeAttempt.error);
    }
    throw new Error("Image clipboard is not available in this environment.");
  }

  const sourceBlob = await fetchImageBlob(image, runtime.fetch);
  const mimeType = getClipboardImageMimeType(sourceBlob.type, image.fileName);
  const clipboardBlob = sourceBlob.type === mimeType ? sourceBlob : new Blob([sourceBlob], { type: mimeType });

  await runtime.clipboard.write([new runtime.ClipboardItem({ [mimeType]: clipboardBlob })]);

  return {
    mimeType,
    native: false,
    size: clipboardBlob.size
  };
}

export async function fetchImageBlob(image: ImageRecord, fetcher: typeof fetch): Promise<Blob> {
  const response = await fetcher(imageFileUrl(image), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to read image file (${response.status}).`);
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error("Image file is empty.");
  }

  return blob;
}

export function getClipboardImageMimeType(blobType: string, fileName: string): string {
  if (blobType.startsWith("image/")) {
    return blobType;
  }

  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowerName.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/png";
}

export function shouldHandleImageCopyShortcut(event: CopyShortcutEvent): boolean {
  if (event.defaultPrevented || !event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return false;
  }

  if (event.key.toLowerCase() !== "c") {
    return false;
  }

  return !isEditableTarget(event.target);
}

export function getImageClipboardRuntime(
  nativeCopyImage?: (image: ImageRecord) => Promise<ImageClipboardCopyResult>
): ImageClipboardRuntime {
  return {
    ClipboardItem: typeof globalThis.ClipboardItem === "function" ? globalThis.ClipboardItem : null,
    clipboard: typeof navigator !== "undefined" && navigator.clipboard ? navigator.clipboard : null,
    fetch: typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null,
    nativeCopyImage
  };
}

async function tryNativeImageCopy(
  image: ImageRecord,
  runtime: ImageClipboardRuntime
): Promise<
  | { caught: false; result: ImageClipboardCopyResult }
  | { caught: true; error: unknown }
> {
  if (!runtime.nativeCopyImage) {
    return { caught: true, error: null };
  }

  try {
    return {
      caught: false,
      result: await runtime.nativeCopyImage(image)
    };
  } catch (error) {
    return { caught: true, error };
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Copy image failed.");
}

function isEditableTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }

  const element = target as {
    getAttribute?: (name: string) => string | null;
    isContentEditable?: boolean;
    tagName?: string;
  };
  const tagName = element.tagName?.toLowerCase();

  return Boolean(
    element.isContentEditable ||
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select" ||
      element.getAttribute?.("role") === "textbox"
  );
}

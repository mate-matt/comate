import type { ImageRecord, ImageSearchResult } from "../../shared/types.js";

export function ensureImageInResult(result: ImageSearchResult, image: ImageRecord): ImageSearchResult {
  const existing = result.items.find((item) => item.id === image.id);
  if (existing) {
    return {
      ...result,
      items: result.items.map((item) => (item.id === image.id ? image : item))
    };
  }

  return {
    ...result,
    items: [image, ...result.items],
    total: Math.max(result.total, result.items.length + 1)
  };
}

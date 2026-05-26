import type { ImageRecord } from "../../shared/types.js";

export const IMAGE_PAGE_SIZE = 120;
export const MAX_RETAINED_IMAGES = 480;

export function mergeImagePages(current: ImageRecord[], incoming: ImageRecord[], maxItems = MAX_RETAINED_IMAGES): ImageRecord[] {
  const byId = new Map<string, ImageRecord>();
  for (const image of current) {
    byId.set(image.id, image);
  }
  for (const image of incoming) {
    byId.set(image.id, image);
  }

  const merged = Array.from(byId.values());
  return merged.length > maxItems ? merged.slice(merged.length - maxItems) : merged;
}

export function canLoadNextImagePage(input: {
  loading: boolean;
  loadingMore: boolean;
  nextOffset: number;
  total: number;
}): boolean {
  return !input.loading && !input.loadingMore && input.nextOffset < input.total;
}

import type { ImageRecord } from "../../shared/types.js";
import { Gallery } from "./Gallery.js";

interface GalleryPaneProps {
  canLoadMore: boolean;
  images: ImageRecord[];
  loading: boolean;
  loadingMore: boolean;
  metaVisible: boolean;
  selectedId: string | null;
  total: number;
  viewMode: "grid" | "list";
  onLoadMore: () => void;
  onSelect: (image: ImageRecord) => void;
}

export function GalleryPane({
  canLoadMore,
  images,
  loading,
  loadingMore,
  metaVisible,
  selectedId,
  total,
  viewMode,
  onLoadMore,
  onSelect
}: GalleryPaneProps) {
  return (
    <section className="gallery-pane" aria-label="Generated image library">
      <Gallery
        canLoadMore={canLoadMore}
        images={images}
        selectedId={selectedId}
        loading={loading}
        loadingMore={loadingMore}
        metaVisible={metaVisible}
        total={total}
        viewMode={viewMode}
        onLoadMore={onLoadMore}
        onSelect={onSelect}
      />
    </section>
  );
}

import type { ImageRecord } from "../../shared/types.js";
import { Gallery } from "./Gallery.js";

interface GalleryPaneProps {
  images: ImageRecord[];
  loading: boolean;
  metaVisible: boolean;
  selectedId: string | null;
  onSelect: (image: ImageRecord) => void;
}

export function GalleryPane({ images, loading, metaVisible, selectedId, onSelect }: GalleryPaneProps) {
  return (
    <section className="gallery-pane" aria-label="Generated image library">
      <Gallery images={images} selectedId={selectedId} loading={loading} metaVisible={metaVisible} onSelect={onSelect} />
    </section>
  );
}

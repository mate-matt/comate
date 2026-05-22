import { Eye, EyeOff } from "lucide-react";

import type { ImageRecord } from "../../shared/types.js";
import { Gallery } from "./Gallery.js";

interface GalleryPaneProps {
  images: ImageRecord[];
  loading: boolean;
  metaVisible: boolean;
  selectedId: string | null;
  onMetaVisibleChange: (visible: boolean) => void;
  onSelect: (image: ImageRecord) => void;
}

export function GalleryPane({
  images,
  loading,
  metaVisible,
  selectedId,
  onMetaVisibleChange,
  onSelect
}: GalleryPaneProps) {
  return (
    <section className="gallery-pane" aria-label="Generated image library">
      <div className="gallery-floating-tools" aria-label="Gallery tools">
        <button
          className={metaVisible ? "gallery-tool-button" : "gallery-tool-button active"}
          type="button"
          onClick={() => onMetaVisibleChange(!metaVisible)}
          title={metaVisible ? "Hide details" : "Show details"}
          aria-label={metaVisible ? "Hide image details" : "Show image details"}
          aria-pressed={!metaVisible}
        >
          {metaVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
      <Gallery images={images} selectedId={selectedId} loading={loading} metaVisible={metaVisible} onSelect={onSelect} />
    </section>
  );
}

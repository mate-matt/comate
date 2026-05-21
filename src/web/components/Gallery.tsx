import type { ImageRecord } from "../../shared/types.js";
import { imageFileUrl } from "../api/client.js";
import { formatDate, middleEllipsis } from "../utils/format.js";

interface GalleryProps {
  images: ImageRecord[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (image: ImageRecord) => void;
}

export function Gallery({ images, selectedId, loading, onSelect }: GalleryProps) {
  if (loading && images.length === 0) {
    return <div className="gallery-state">Loading</div>;
  }

  if (images.length === 0) {
    return <div className="gallery-state">No images</div>;
  }

  return (
    <main className="gallery" aria-label="Generated images">
      {images.map((image) => (
        <button
          key={image.id}
          className={selectedId === image.id ? "image-tile selected" : "image-tile"}
          onClick={() => onSelect(image)}
        >
          <span className="thumb-frame">
            <img src={imageFileUrl(image)} alt={image.threadName ?? image.fileName} loading="lazy" />
          </span>
          <span className="tile-meta">
            <strong>{image.threadName ?? "Untitled"}</strong>
            <span>{formatDate(image.generatedAt ?? image.fileModifiedAt)}</span>
            <small>{middleEllipsis(image.fileName)}</small>
          </span>
        </button>
      ))}
    </main>
  );
}

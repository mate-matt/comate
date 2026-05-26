import { useEffect, useRef, type RefObject } from "react";

import type { ImageRecord } from "../../shared/types.js";
import { imageThumbnailUrl } from "../api/client.js";
import { formatBytes, formatDate, middleEllipsis } from "../utils/format.js";

interface GalleryProps {
  canLoadMore: boolean;
  images: ImageRecord[];
  selectedId: string | null;
  loading: boolean;
  loadingMore: boolean;
  metaVisible: boolean;
  total: number;
  viewMode: "grid" | "list";
  onLoadMore: () => void;
  onSelect: (image: ImageRecord) => void;
}

export function Gallery({
  canLoadMore,
  images,
  selectedId,
  loading,
  loadingMore,
  metaVisible,
  total,
  viewMode,
  onLoadMore,
  onSelect
}: GalleryProps) {
  const containerRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useLoadMoreSentinel({
    canLoadMore: images.length > 0 && canLoadMore,
    containerRef,
    onLoadMore,
    sentinelRef
  });

  if (loading && images.length === 0) {
    return <div className="gallery-state">Loading</div>;
  }

  if (images.length === 0) {
    return <div className="gallery-state">No images</div>;
  }

  if (viewMode === "list") {
    return (
      <main ref={containerRef} className="gallery-list" aria-label="Generated images">
        {images.map((image) => (
          <button
            key={image.id}
            className={selectedId === image.id ? "image-list-row selected" : "image-list-row"}
            onClick={() => onSelect(image)}
          >
            <span className="list-thumb-frame">
              <img src={imageThumbnailUrl(image)} alt={image.threadName ?? image.fileName} loading="lazy" decoding="async" />
            </span>
            <span className="list-row-main">
              <strong>{image.threadName ?? "Untitled"}</strong>
              <span>{middleEllipsis(image.fileName, 54)}</span>
            </span>
            <span className="list-row-meta">
              <em>{formatDate(image.generatedAt ?? image.fileModifiedAt)}</em>
              <small>{formatImageSize(image)}</small>
            </span>
            <span className={image.hasPrompt ? "list-row-prompt has-prompt" : "list-row-prompt"}>{image.hasPrompt ? "Prompt" : "No prompt"}</span>
          </button>
        ))}
        <GalleryLoadState
          canLoadMore={canLoadMore}
          loadingMore={loadingMore}
          retainedCount={images.length}
          sentinelRef={sentinelRef}
          total={total}
        />
      </main>
    );
  }

  return (
    <main ref={containerRef} className={metaVisible ? "gallery" : "gallery gallery-clean"} aria-label="Generated images">
      {images.map((image) => (
        <button
          key={image.id}
          className={selectedId === image.id ? "image-tile selected" : "image-tile"}
          onClick={() => onSelect(image)}
        >
          <span className="thumb-frame">
            <img src={imageThumbnailUrl(image)} alt={image.threadName ?? image.fileName} loading="lazy" decoding="async" />
          </span>
          {metaVisible ? (
            <span className="tile-meta">
              <strong>{image.threadName ?? "Untitled"}</strong>
              <span>{formatDate(image.generatedAt ?? image.fileModifiedAt)}</span>
              <small>{middleEllipsis(image.fileName)}</small>
            </span>
          ) : null}
        </button>
      ))}
      <GalleryLoadState
        canLoadMore={canLoadMore}
        loadingMore={loadingMore}
        retainedCount={images.length}
        sentinelRef={sentinelRef}
        total={total}
      />
    </main>
  );
}

function formatImageSize(image: ImageRecord): string {
  if (image.width && image.height) {
    return `${image.width} x ${image.height} · ${formatBytes(image.sizeBytes)}`;
  }

  return formatBytes(image.sizeBytes);
}

function GalleryLoadState({
  canLoadMore,
  loadingMore,
  retainedCount,
  sentinelRef,
  total
}: {
  canLoadMore: boolean;
  loadingMore: boolean;
  retainedCount: number;
  sentinelRef: RefObject<HTMLDivElement | null>;
  total: number;
}) {
  if (!canLoadMore && !loadingMore && retainedCount >= total) {
    return null;
  }

  return (
    <div ref={sentinelRef} className="gallery-load-more">
      {loadingMore ? "Loading more" : canLoadMore ? "Load more" : `${retainedCount} visible`}
    </div>
  );
}

function useLoadMoreSentinel({
  canLoadMore,
  containerRef,
  onLoadMore,
  sentinelRef
}: {
  canLoadMore: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onLoadMore: () => void;
  sentinelRef: RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    if (!canLoadMore || typeof IntersectionObserver === "undefined") {
      return;
    }

    const root = containerRef.current;
    const target = sentinelRef.current;
    if (!root || !target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMore();
        }
      },
      { root, rootMargin: "720px 0px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [canLoadMore, containerRef, onLoadMore, sentinelRef]);
}

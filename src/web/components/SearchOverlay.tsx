import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ImageRecord } from "../../shared/types.js";
import { imageThumbnailUrl } from "../api/client.js";
import { formatDate, middleEllipsis } from "../utils/format.js";

interface SearchOverlayProps {
  images: ImageRecord[];
  loading: boolean;
  open: boolean;
  query: string;
  selectedId: string | null;
  total: number;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelectImage: (image: ImageRecord) => void;
}

const RESULT_LIMIT = 9;

export function SearchOverlay({
  images,
  loading,
  open,
  query,
  selectedId,
  total,
  onOpenChange,
  onQueryChange,
  onSelectImage
}: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = useMemo(() => images.slice(0, RESULT_LIMIT), [images]);
  const suggestionKey = suggestions.map((image) => image.id).join("|");

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    const selectedIndex = selectedId ? suggestions.findIndex((image) => image.id === selectedId) : -1;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : suggestions.length > 0 ? 0 : -1);
  }, [open, query, selectedId, suggestionKey, suggestions]);

  if (!open) {
    return null;
  }

  function commitImage(image: ImageRecord): void {
    onSelectImage(image);
    onOpenChange(false);
  }

  function moveActive(delta: number): void {
    setActiveIndex((current) => {
      if (suggestions.length === 0) {
        return -1;
      }
      if (current < 0) {
        return 0;
      }
      return (current + delta + suggestions.length) % suggestions.length;
    });
  }

  return (
    <div
      className="search-overlay"
      role="dialog"
      aria-label="Search"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div className="search-dialog">
        <div className="search-input-row">
          <Search size={20} aria-hidden="true" />
          <input
            ref={inputRef}
            aria-label="Search images"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onOpenChange(false);
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                moveActive(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                moveActive(-1);
              } else if (event.key === "Enter") {
                const activeImage = suggestions[activeIndex];
                if (activeImage) {
                  event.preventDefault();
                  commitImage(activeImage);
                }
              }
            }}
            placeholder="Search filename, title, prompt, date"
          />
          <button
            type="button"
            onClick={() => {
              if (query) {
                onQueryChange("");
              } else {
                onOpenChange(false);
              }
            }}
            title={query ? "Clear" : "Close"}
            aria-label={query ? "Clear search" : "Close search"}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="search-results" role="listbox" aria-label="Search results">
          {suggestions.map((image, index) => (
            <button
              key={image.id}
              type="button"
              className={index === activeIndex ? "search-result-item active" : "search-result-item"}
              role="option"
              aria-selected={index === activeIndex}
              onClick={() => commitImage(image)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="search-result-thumb">
                <img src={imageThumbnailUrl(image)} alt={image.threadName ?? image.fileName} loading="lazy" decoding="async" />
              </span>
              <span className="search-result-copy">
                <strong>{image.threadName ?? "Untitled"}</strong>
                <span>{formatDate(image.generatedAt ?? image.fileModifiedAt)}</span>
                <small>{middleEllipsis(image.fileName, 40)}</small>
              </span>
              <span className="search-result-source">{findHitSource(image, query)}</span>
            </button>
          ))}

          {suggestions.length === 0 ? (
            <div className="search-empty">{loading ? "Searching" : query.trim() ? "No matches" : "No images"}</div>
          ) : total > RESULT_LIMIT ? (
            <div className="search-count">{total} matches</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function findHitSource(image: ImageRecord, query: string): string {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return "recent";
  }

  const generatedAt = image.generatedAt ?? image.fileModifiedAt;
  const fields: Array<[string, string | null]> = [
    ["filename", image.fileName],
    ["title", image.threadName],
    ["prompt", image.prompt],
    ["date", generatedAt]
  ];

  for (const [label, value] of fields) {
    if (value && normalizeSearchText(value).includes(normalizedQuery)) {
      return label;
    }
  }

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (queryTokens.length > 1) {
    for (const [label, value] of fields) {
      const normalizedValue = normalizeSearchText(value ?? "");
      if (queryTokens.every((token) => normalizedValue.includes(token))) {
        return label;
      }
    }
  }

  return "match";
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

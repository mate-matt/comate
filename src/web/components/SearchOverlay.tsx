import { Search, X } from "lucide-react";
import { useEffect, useRef } from "react";

interface SearchOverlayProps {
  open: boolean;
  query: string;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
}

export function SearchOverlay({ open, query, onOpenChange, onQueryChange }: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
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
        <Search size={20} aria-hidden="true" />
        <input
          ref={inputRef}
          aria-label="Search images"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onOpenChange(false);
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
    </div>
  );
}

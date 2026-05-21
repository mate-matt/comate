import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface FloatingSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
}

export function FloatingSearch({ query, onQueryChange }: FloatingSearchProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return (
      <button
        className={query ? "floating-search-button active" : "floating-search-button"}
        type="button"
        onClick={() => setOpen(true)}
        title="Search"
        aria-label="Search"
      >
        <Search size={18} aria-hidden="true" />
      </button>
    );
  }

  return (
    <label className="floating-search-box">
      <Search size={17} aria-hidden="true" />
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
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
            setOpen(false);
          }
        }}
        title={query ? "Clear" : "Close"}
        aria-label={query ? "Clear search" : "Close search"}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </label>
  );
}

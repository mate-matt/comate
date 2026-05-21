import { RefreshCcw, Search } from "lucide-react";

interface HeaderProps {
  query: string;
  total: number;
  loading: boolean;
  refreshing: boolean;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
}

export function Header({ query, total, loading, refreshing, onQueryChange, onRefresh }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">CM</span>
        <span className="brand-name">Codex Mate</span>
      </div>

      <label className="search-box">
        <Search size={17} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search filename, title, prompt, date"
        />
      </label>

      <div className="header-actions">
        <span className="image-count">{loading ? "Loading" : `${total} images`}</span>
        <button className="icon-button" onClick={onRefresh} disabled={refreshing} title="Refresh">
          <RefreshCcw size={17} aria-hidden="true" className={refreshing ? "spin" : undefined} />
        </button>
      </div>
    </header>
  );
}

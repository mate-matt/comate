import { CalendarDays, Clock3, Image as ImageIcon, Images, MessageSquareText, RefreshCcw, Search } from "lucide-react";

import type { DatePreset, PromptState, SessionFacet } from "../../shared/types.js";

interface SidebarProps {
  datePreset: DatePreset;
  imageTotal: number;
  loading: boolean;
  promptState: PromptState;
  query: string;
  refreshing: boolean;
  sessionId: string | undefined;
  sessions: SessionFacet[];
  onDatePresetChange: (value: DatePreset) => void;
  onPromptStateChange: (value: PromptState) => void;
  onRefresh: () => void;
  onSearchOpen: () => void;
  onSessionChange: (value: string | undefined) => void;
}

const DATE_FILTERS: Array<{ label: string; value: DatePreset }> = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "7 days", value: "week" },
  { label: "30 days", value: "month" }
];

export function Sidebar({
  datePreset,
  imageTotal,
  loading,
  promptState,
  query,
  refreshing,
  sessionId,
  sessions,
  onDatePresetChange,
  onPromptStateChange,
  onRefresh,
  onSearchOpen,
  onSessionChange
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-fixed">
        <div className="sidebar-brand">
          <span className="brand-mark">CM</span>
          <div className="brand-copy">
            <span className="brand-name">Codex Mate</span>
            <span>{loading ? "Loading" : `${imageTotal} images`}</span>
          </div>
          <button className="icon-button" onClick={onRefresh} disabled={refreshing} title="Refresh">
            <RefreshCcw size={16} aria-hidden="true" className={refreshing ? "spin" : undefined} />
          </button>
        </div>

        <nav className="filter-group" aria-label="Date filters">
          {DATE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              className={datePreset === filter.value ? "filter-item active" : "filter-item"}
              onClick={() => onDatePresetChange(filter.value)}
            >
              {filter.value === "all" ? <ImageIcon size={16} /> : filter.value === "today" ? <Clock3 size={16} /> : <CalendarDays size={16} />}
              <span>{filter.label}</span>
            </button>
          ))}
        </nav>

        <div className="filter-group">
          <button
            className={query ? "filter-item active search-entry" : "filter-item search-entry"}
            onClick={onSearchOpen}
          >
            <Search size={16} />
            <span>Search</span>
          </button>
          <button
            className={promptState === "withPrompt" ? "filter-item active" : "filter-item"}
            onClick={() => onPromptStateChange(promptState === "withPrompt" ? "all" : "withPrompt")}
          >
            <MessageSquareText size={16} />
            <span>With prompt</span>
          </button>
          <button
            className={promptState === "withoutPrompt" ? "filter-item active" : "filter-item"}
            onClick={() => onPromptStateChange(promptState === "withoutPrompt" ? "all" : "withoutPrompt")}
          >
            <MessageSquareText size={16} />
            <span>No prompt</span>
          </button>
        </div>

        <button className={!sessionId ? "session-item active" : "session-item"} onClick={() => onSessionChange(undefined)}>
          <span>All sessions</span>
        </button>
      </div>

      <div className="session-list">
        {sessions.slice(0, 36).map((session) => (
          <button
            key={session.sessionId}
            className={sessionId === session.sessionId ? "session-item active" : "session-item"}
            onClick={() => onSessionChange(session.sessionId)}
            title={session.threadName ?? session.sessionId}
          >
            <span>{session.threadName ?? session.sessionId}</span>
            <em>{session.count}</em>
          </button>
        ))}
      </div>

      <div className="sidebar-tools" role="tablist" aria-label="Tools">
        <button className="tool-tab active" type="button" title="Library" aria-selected="true">
          <Images size={16} />
        </button>
      </div>
    </aside>
  );
}

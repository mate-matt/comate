import { CalendarDays, Clock3, Image as ImageIcon, Images, MessageSquareText, Settings } from "lucide-react";

import type { DatePreset, PromptState, SessionFacet } from "../../shared/types.js";

interface SidebarProps {
  datePreset: DatePreset;
  promptState: PromptState;
  sessionId: string | undefined;
  sessions: SessionFacet[];
  onDatePresetChange: (value: DatePreset) => void;
  onPromptStateChange: (value: PromptState) => void;
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
  promptState,
  sessionId,
  sessions,
  onDatePresetChange,
  onPromptStateChange,
  onSessionChange
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-fixed">
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
        <button className="tool-tab" type="button" title="Settings" aria-selected="false" disabled>
          <Settings size={16} />
        </button>
      </div>
    </aside>
  );
}

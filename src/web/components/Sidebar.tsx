import { useState } from "react";
import { CalendarDays, ChevronDown, Clock3, Image as ImageIcon, Images, MessageSquareText } from "lucide-react";

import type { DatePreset, PromptState, SessionFacet } from "../../shared/types.js";

const comateIconUrl = new URL("../../../assets/comate-icon.svg", import.meta.url).href;

interface SidebarProps {
  collapsed: boolean;
  datePreset: DatePreset;
  imageTotal: number;
  loading: boolean;
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
  collapsed,
  datePreset,
  imageTotal,
  loading,
  promptState,
  sessionId,
  sessions,
  onDatePresetChange,
  onPromptStateChange,
  onSessionChange
}: SidebarProps) {
  const [sessionsExpanded, setSessionsExpanded] = useState(true);
  const handleDatePresetChange = (value: DatePreset) => {
    onDatePresetChange(value);

    if (value === "all") {
      onSessionChange(undefined);
    }
  };
  const isDateFilterActive = (value: DatePreset) => {
    return value === "all" ? datePreset === "all" && !sessionId : datePreset === value;
  };

  if (collapsed) {
    return (
      <aside className="sidebar collapsed" aria-label="Library navigation">
        <div className="rail-brand" title="CoMate">
          <img src={comateIconUrl} alt="CoMate" />
        </div>
        <nav className="rail-nav" aria-label="Library shortcuts">
          <button
            className={isDateFilterActive("all") ? "rail-button active" : "rail-button"}
            type="button"
            onClick={() => handleDatePresetChange("all")}
            title="All images"
            aria-label="All images"
          >
            <ImageIcon size={18} aria-hidden="true" />
          </button>
          <button
            className={isDateFilterActive("today") ? "rail-button active" : "rail-button"}
            type="button"
            onClick={() => handleDatePresetChange("today")}
            title="Today"
            aria-label="Today"
          >
            <Clock3 size={18} aria-hidden="true" />
          </button>
          <button
            className={promptState !== "all" ? "rail-button active" : "rail-button"}
            type="button"
            onClick={() => onPromptStateChange(promptState === "all" ? "withPrompt" : "all")}
            title={promptState === "all" ? "Show images with prompts" : "Clear prompt filter"}
            aria-label={promptState === "all" ? "Show images with prompts" : "Clear prompt filter"}
          >
            <MessageSquareText size={18} aria-hidden="true" />
          </button>
        </nav>
        <div className="rail-total" title={loading ? "Loading" : `${imageTotal} images`}>
          {loading ? "..." : imageTotal}
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-fixed">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">
            <img src={comateIconUrl} alt="" />
          </span>
          <div className="brand-copy">
            <span className="brand-name">CoMate</span>
          </div>
        </div>

        <nav className="filter-group" aria-label="Date filters">
          {DATE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              className={isDateFilterActive(filter.value) ? "filter-item active" : "filter-item"}
              onClick={() => handleDatePresetChange(filter.value)}
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
      </div>

      <section className={sessionsExpanded ? "session-section" : "session-section collapsed"} aria-label="Sessions">
        <button
          className="session-section-toggle"
          type="button"
          onClick={() => setSessionsExpanded((current) => !current)}
          aria-expanded={sessionsExpanded}
        >
          <span>Sessions</span>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
        {sessionsExpanded ? (
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
        ) : null}
      </section>

      <div className="sidebar-tools" role="tablist" aria-label="Tools">
        <button className="tool-tab active" type="button" title="Library" aria-selected="true">
          <Images size={16} />
        </button>
      </div>
    </aside>
  );
}

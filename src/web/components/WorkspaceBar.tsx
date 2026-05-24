import {
  Captions,
  CaptionsOff,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RefreshCcw,
  Search
} from "lucide-react";

import type { WorkspacePanelState } from "../domain/workspaceLayout.js";

interface WorkspaceBarProps {
  leftPanelState: WorkspacePanelState;
  metaVisible: boolean;
  metaToggleVisible?: boolean;
  refreshing: boolean;
  refreshLabel?: string;
  rightPanelState: WorkspacePanelState;
  searchVisible?: boolean;
  title: string;
  onMetaVisibleChange?: (visible: boolean) => void;
  onRefresh: () => void;
  onSearchOpen: () => void;
  onToggleLeftPanel: () => void;
  onToggleRightPanel: () => void;
}

export function WorkspaceBar({
  leftPanelState,
  metaVisible,
  metaToggleVisible = true,
  refreshing,
  refreshLabel = "Refresh library",
  rightPanelState,
  searchVisible = true,
  title,
  onMetaVisibleChange,
  onRefresh,
  onSearchOpen,
  onToggleLeftPanel,
  onToggleRightPanel
}: WorkspaceBarProps) {
  const leftExpanded = leftPanelState === "expanded";
  const rightExpanded = rightPanelState === "expanded";

  return (
    <header className="workspace-bar">
      <button
        className="workspace-edge-button"
        type="button"
        onClick={onToggleLeftPanel}
        title={leftExpanded ? "Collapse sidebar" : "Expand sidebar"}
        aria-label={leftExpanded ? "Collapse sidebar" : "Expand sidebar"}
        aria-expanded={leftExpanded}
        data-panel-side="left"
      >
        {leftExpanded ? (
          <PanelLeftClose size={16} aria-hidden="true" />
        ) : (
          <PanelLeftOpen size={16} aria-hidden="true" />
        )}
      </button>

      <div className="workspace-title">
        <h1>{title}</h1>
      </div>

      <div className="workspace-actions" aria-label="Workspace actions">
        {searchVisible ? (
          <button
            className="workspace-search-button"
            type="button"
            onClick={onSearchOpen}
            aria-label="Search workspace"
          >
            <Search size={14} aria-hidden="true" />
            <span>Search</span>
          </button>
        ) : null}
        {metaToggleVisible && onMetaVisibleChange ? (
          <button
            className="workspace-tool-button workspace-detail-toggle"
            type="button"
            onClick={() => onMetaVisibleChange(!metaVisible)}
            title={metaVisible ? "Hide grid details" : "Show grid details"}
            aria-label={metaVisible ? "Hide grid details" : "Show grid details"}
            aria-pressed={metaVisible}
          >
            {metaVisible ? <Captions size={15} aria-hidden="true" /> : <CaptionsOff size={15} aria-hidden="true" />}
          </button>
        ) : null}
        <button
          className="workspace-tool-button"
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          title={refreshLabel}
          aria-label={refreshLabel}
        >
          <RefreshCcw size={15} aria-hidden="true" className={refreshing ? "spin" : undefined} />
        </button>
      </div>

      <button
        className="workspace-edge-button"
        type="button"
        onClick={onToggleRightPanel}
        title={rightExpanded ? "Collapse inspector" : "Expand inspector"}
        aria-label={rightExpanded ? "Collapse inspector" : "Expand inspector"}
        aria-expanded={rightExpanded}
        data-panel-side="right"
      >
        {rightExpanded ? (
          <PanelRightClose size={16} aria-hidden="true" />
        ) : (
          <PanelRightOpen size={16} aria-hidden="true" />
        )}
      </button>
    </header>
  );
}

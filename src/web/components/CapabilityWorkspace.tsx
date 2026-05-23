import { AlertTriangle, Search } from "lucide-react";

import type { CapabilityRecord, CapabilityScanResult } from "../../shared/types.js";
import {
  filterCapabilities,
  getCapabilityKindName,
  getCapabilitySummaryText,
  getIssueSummary,
  groupCapabilities
} from "../domain/capabilityView.js";
import { getCapabilitySectionLabel, type CapabilitySection } from "../domain/navigation.js";

interface CapabilityWorkspaceProps {
  capabilities: CapabilityScanResult | null;
  error: string | null;
  loading: boolean;
  query: string;
  section: CapabilitySection;
  selectedId: string | null;
  onQueryChange: (value: string) => void;
  onSelect: (capability: CapabilityRecord) => void;
}

export function CapabilityWorkspace({
  capabilities,
  error,
  loading,
  query,
  section,
  selectedId,
  onQueryChange,
  onSelect
}: CapabilityWorkspaceProps) {
  const visibleItems = filterCapabilities(capabilities, section, query);
  const groups = groupCapabilities(visibleItems);
  const issueSummary = getIssueSummary(capabilities?.summary ?? null);

  return (
    <section className="capability-workspace" aria-label="Codex capability map">
      <div className="capability-toolbar">
        <div className="capability-toolbar-title">
          <span>{getCapabilitySectionLabel(section)}</span>
          <em>{loading ? "Scanning" : `${visibleItems.length} entries`}</em>
        </div>
        <label className="capability-search">
          <Search size={14} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder="Search capabilities"
            aria-label="Search capabilities"
          />
        </label>
      </div>

      {issueSummary ? (
        <div className="capability-issue-summary">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>{issueSummary}</span>
          <small>Open Issues in the sidebar to review only affected entries.</small>
        </div>
      ) : null}

      {error ? (
        <div className="capability-state error">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {!error && loading && !capabilities ? <div className="capability-state">Scanning Codex abilities...</div> : null}

      {!error && !loading && capabilities && visibleItems.length === 0 ? (
        <div className="capability-state">No matching capabilities.</div>
      ) : null}

      <div className="capability-list" aria-label="Capability entries">
        {groups.map((group) => (
          <section key={group.kind} className="capability-group">
            <header>
              <span>{group.label}</span>
              <em>{group.items.length}</em>
            </header>
            <div className="capability-group-list">
              {group.items.map((capability) => (
                <CapabilityRow
                  key={capability.id}
                  capability={capability}
                  selected={capability.id === selectedId}
                  showKind={section === "overview" || section === "issues"}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function CapabilityRow({
  capability,
  selected,
  showKind,
  onSelect
}: {
  capability: CapabilityRecord;
  selected: boolean;
  showKind: boolean;
  onSelect: (capability: CapabilityRecord) => void;
}) {
  return (
    <button
      className={selected ? "capability-row selected" : "capability-row"}
      type="button"
      onClick={() => onSelect(capability)}
    >
      <span className="capability-row-main">
        <strong>{capability.name}</strong>
        <small>{getCapabilitySummaryText(capability)}</small>
      </span>
      <span className="capability-row-tags">
        <span className="capability-source">{capability.source}</span>
        <span className={`capability-status status-${capability.status}`}>{capability.status}</span>
        {capability.issues.length > 0 ? <em>{capability.issues.length}</em> : null}
        {showKind ? <span className={`capability-kind kind-${capability.kind}`}>{getCapabilityKindName(capability.kind)}</span> : null}
      </span>
    </button>
  );
}

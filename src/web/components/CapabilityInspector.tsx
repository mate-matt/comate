import { Copy, ExternalLink, FolderOpen } from "lucide-react";

import type { CapabilityRecord } from "../../shared/types.js";
import {
  getCapabilityIssueViews,
  getCapabilityKindName,
  getCapabilitySummaryText,
  getCapabilityUsageLines,
  getUsefulDependencies
} from "../domain/capabilityView.js";
import { middleEllipsis } from "../utils/format.js";

interface CapabilityInspectorProps {
  capability: CapabilityRecord | null;
  collapsed?: boolean;
  onOpenPath: (path: string, action: "openFile" | "revealFile") => void;
}

export function CapabilityInspector({ capability, collapsed = false, onOpenPath }: CapabilityInspectorProps) {
  if (collapsed) {
    return <aside className="detail-panel capability-inspector collapsed" aria-hidden="true" />;
  }

  if (!capability) {
    return (
      <aside className="detail-panel capability-inspector empty">
        <span>Select capability</span>
      </aside>
    );
  }

  const issues = getCapabilityIssueViews(capability);
  const resources = getUsefulDependencies(capability);
  const usageLines = getCapabilityUsageLines(capability);

  return (
    <aside className="detail-panel capability-inspector">
      <section className="capability-hero">
        <div className="capability-title-row">
          <h2>{capability.name}</h2>
          <span className={`capability-status status-${capability.status}`}>{capability.status}</span>
        </div>
        <div className="capability-chip-row">
          <span className={`capability-kind kind-${capability.kind}`}>{getCapabilityKindName(capability.kind)}</span>
          <span>{capability.source}</span>
          <span>{capability.origin}</span>
        </div>
        <p>{getCapabilitySummaryText(capability, 210)}</p>
      </section>

      <section className={issues.length > 0 ? "detail-section capability-section attention-section" : "detail-section capability-section quiet-section"}>
        <div className="detail-section-heading">
          <span>需要注意</span>
        </div>
        <div className="capability-detail-list">
          {issues.length > 0 ? (
            issues.map((issue) => (
              <div key={`${issue.code}:${issue.title}`} className={`capability-issue severity-${issue.severity}`}>
                <strong>{issue.title}</strong>
                <span>{issue.detail}</span>
              </div>
            ))
          ) : (
            <div className="capability-detail-empty">没有发现需要处理的问题。</div>
          )}
        </div>
      </section>

      <section className="detail-section capability-section">
        <div className="detail-section-heading">
          <span>使用方式</span>
        </div>
        <div className="capability-detail-list">
          {usageLines.map((line) => (
            <div key={line} className="capability-detail-note">
              {line}
            </div>
          ))}
        </div>
      </section>

      {resources.length > 0 ? (
        <section className="detail-section capability-section">
          <div className="detail-section-heading">
            <span>资源</span>
          </div>
          <div className="capability-detail-list">
            {resources.map((resource) => (
              <div key={`${resource.kind}:${resource.path ?? resource.label}`} className="capability-detail-row">
                <strong>{resource.label}</strong>
                <span>{resource.purpose}</span>
                {resource.count !== undefined ? <em>{resource.count}</em> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="detail-section capability-section location-section">
        <div className="detail-section-heading">
          <span>位置</span>
        </div>
        <div className="capability-location">
          <code title={capability.path ?? undefined}>{capability.path ? middleEllipsis(capability.path, 48) : "No local path"}</code>
          {capability.path ? (
            <div className="detail-actions capability-actions">
              <button onClick={() => onOpenPath(capability.path!, "openFile")}>
                <ExternalLink size={16} />
                打开
              </button>
              <button onClick={() => onOpenPath(capability.path!, "revealFile")}>
                <FolderOpen size={16} />
                目录
              </button>
              <button onClick={() => navigator.clipboard.writeText(capability.path!)}>
                <Copy size={16} />
                路径
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </aside>
  );
}

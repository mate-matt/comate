import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Copy, ExternalLink, FolderOpen } from "lucide-react";

import type { ImageContextResult, ImageRecord } from "../../shared/types.js";
import { imageFileUrl, openImage } from "../api/client.js";
import { formatBytes, formatFullDate, middleEllipsis } from "../utils/format.js";

type DetailTab = "prompt" | "context" | "details";

interface DetailPanelProps {
  collapsed?: boolean;
  context?: ImageContextResult | null;
  contextError?: string | null;
  contextLoading?: boolean;
  image: ImageRecord | null;
  onCopyImage?: (image: ImageRecord) => void | Promise<void>;
}

export function DetailPanel({
  collapsed = false,
  context = null,
  contextError = null,
  contextLoading = false,
  image,
  onCopyImage
}: DetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>(() => (image?.prompt ? "prompt" : "context"));

  useEffect(() => {
    if (image) {
      setActiveTab(image.prompt ? "prompt" : "context");
    }
  }, [image?.id, image?.prompt]);

  if (collapsed) {
    return <aside className="detail-panel collapsed" aria-hidden="true" />;
  }

  if (!image) {
    return (
      <aside className="detail-panel empty">
        <span>Select image</span>
      </aside>
    );
  }

  const dimensions = image.width && image.height ? `${image.width} x ${image.height}` : "Unknown";
  const contextMessages = context?.messages ?? [];
  const tabLabelId = `detail-tab-${activeTab}`;

  return (
    <aside className="detail-panel">
      <DetailPreview image={image} dimensions={dimensions} />
      <DetailActions image={image} onCopyImage={onCopyImage} />

      <div className="detail-content">
        <div className="detail-tabs" role="tablist" aria-label="Image information">
          <DetailTabButton activeTab={activeTab} tab="prompt" onSelect={setActiveTab} />
          <DetailTabButton activeTab={activeTab} tab="context" onSelect={setActiveTab} />
          <DetailTabButton activeTab={activeTab} tab="details" onSelect={setActiveTab} />
        </div>

        <section
          id="detail-tab-panel"
          className={`detail-tab-panel detail-tab-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={tabLabelId}
        >
          {activeTab === "prompt" ? <PromptPanel image={image} /> : null}
          {activeTab === "context" ? (
            <ContextPanel context={context} error={contextError} loading={contextLoading} messageCount={contextMessages.length} />
          ) : null}
          {activeTab === "details" ? <DetailsPanel dimensions={dimensions} image={image} /> : null}
        </section>
      </div>
    </aside>
  );
}

function DetailPreview({ dimensions, image }: { dimensions: string; image: ImageRecord }) {
  return (
    <div className="detail-preview">
      <div className="detail-image-frame">
        <img src={imageFileUrl(image)} alt={image.threadName ?? image.fileName} />
      </div>
      <div className="detail-summary">
        <strong title={image.threadName ?? image.fileName}>{image.threadName ?? "Untitled"}</strong>
        <span>
          {formatFullDate(image.generatedAt ?? image.fileModifiedAt)} · {dimensions} · {formatBytes(image.sizeBytes)}
        </span>
      </div>
    </div>
  );
}

function DetailActions({
  image,
  onCopyImage
}: {
  image: ImageRecord;
  onCopyImage?: (image: ImageRecord) => void | Promise<void>;
}) {
  return (
    <div className="detail-actions">
      <button
        className="detail-action-button"
        disabled={!onCopyImage}
        title="Copy image"
        aria-label="Copy image"
        onClick={() => void onCopyImage?.(image)}
      >
        <Copy size={16} />
        Copy
      </button>
      <button className="detail-action-button" aria-label="Open image" title="Open image" onClick={() => openImage(image.id, "openFile")}>
        <ExternalLink size={16} />
        Open
      </button>
      <button
        className="detail-action-button"
        aria-label="Reveal in folder"
        title="Reveal in folder"
        onClick={() => openImage(image.id, "revealFile")}
      >
        <FolderOpen size={16} />
        Folder
      </button>
    </div>
  );
}

function DetailTabButton({
  activeTab,
  onSelect,
  tab
}: {
  activeTab: DetailTab;
  onSelect: (tab: DetailTab) => void;
  tab: DetailTab;
}) {
  const selected = activeTab === tab;
  return (
    <button
      id={`detail-tab-${tab}`}
      className={selected ? "detail-tab active" : "detail-tab"}
      role="tab"
      aria-controls="detail-tab-panel"
      aria-selected={selected}
      onClick={() => onSelect(tab)}
    >
      {getTabLabel(tab)}
    </button>
  );
}

function PromptPanel({ image }: { image: ImageRecord }) {
  return (
    <>
      <div className="detail-tab-toolbar">
        <div className="detail-source-stack">
          <span>Source</span>
          <small className={`detail-source-pill source-${image.promptSource}`}>{getPromptSourceLabel(image)}</small>
        </div>
        <button
          className="detail-copy-button"
          disabled={!image.prompt}
          aria-label="Copy prompt"
          title="Copy prompt"
          onClick={() => image.prompt && navigator.clipboard.writeText(image.prompt)}
        >
          <Copy size={14} />
        </button>
      </div>
      <pre className={image.prompt ? "prompt-reader" : "prompt-reader empty"}>
        {image.prompt ?? "No exact prompt found. Nearby context may still be available."}
      </pre>
    </>
  );
}

function ContextPanel({
  context,
  error,
  loading,
  messageCount
}: {
  context: ImageContextResult | null;
  error: string | null;
  loading: boolean;
  messageCount: number;
}) {
  return (
    <>
      <div className="detail-tab-toolbar">
        <div className="detail-source-stack">
          <span>Source</span>
          <small className={`detail-source-pill ${getContextSourceClass(context, loading, error)}`}>
            {getContextSourceLabel(context, loading, error)}
          </small>
        </div>
        <button
          className="detail-copy-button"
          disabled={messageCount === 0}
          aria-label="Copy context"
          title="Copy context"
          onClick={() => context && messageCount > 0 && navigator.clipboard.writeText(formatContextForClipboard(context))}
        >
          <Copy size={14} />
        </button>
      </div>
      <ContextTimeline context={context} error={error} loading={loading} />
    </>
  );
}

function ContextTimeline({
  context,
  error,
  loading
}: {
  context: ImageContextResult | null;
  error: string | null;
  loading: boolean;
}) {
  const sections = useMemo(() => splitContextMessages(context), [context]);

  if (loading) {
    return <div className="context-state">Loading</div>;
  }

  if (error) {
    return <div className="context-state error">{error}</div>;
  }

  if (!context || context.messages.length === 0) {
    return <div className="context-state">No nearby conversation</div>;
  }

  return (
    <div className="context-timeline">
      <ContextMessageGroup label={sections.before.length > 0 ? "Before" : "Nearby"} messages={sections.before} />
      <div className="context-anchor">
        <span />
        <strong>Image generated here</strong>
      </div>
      <ContextMessageGroup label="After" messages={sections.after} />
    </div>
  );
}

function ContextMessageGroup({
  label,
  messages
}: {
  label: string;
  messages: ImageContextResult["messages"];
}) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <section className="context-message-group">
      <h3>{label}</h3>
      <ol className="context-message-list">
        {messages.map((message) => (
          <li key={`${message.position}-${message.role}-${message.timestamp ?? "no-time"}`} className={`context-message role-${message.role}`}>
            <div className="context-message-meta">
              <strong>{formatContextRole(message.role)}</strong>
              {message.timestamp ? <time dateTime={message.timestamp}>{formatFullDate(message.timestamp)}</time> : null}
            </div>
            <p>{message.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DetailsPanel({ dimensions, image }: { dimensions: string; image: ImageRecord }) {
  return (
    <dl className="detail-meta-list">
      <Meta label="Title" value={image.threadName ?? "Untitled"} />
      <Meta label="Date" value={formatFullDate(image.generatedAt ?? image.fileModifiedAt)} />
      <Meta label="File" value={middleEllipsis(image.fileName, 42)} title={image.fileName} />
      <Meta label="Size" value={`${dimensions} · ${formatBytes(image.sizeBytes)}`} />
      <Meta label="Session" value={middleEllipsis(image.sessionId, 24)} title={image.sessionId} />
      <Meta
        action={
          <button className="meta-copy-button" aria-label="Copy file path" title="Copy file path" onClick={() => navigator.clipboard.writeText(image.filePath)}>
            <Copy size={13} />
          </button>
        }
        label="Path"
        value={middleEllipsis(image.filePath, 42)}
        title={image.filePath}
      />
    </dl>
  );
}

function Meta({
  action,
  label,
  title,
  value
}: {
  action?: ReactNode;
  label: string;
  title?: string;
  value: string;
}) {
  return (
    <div className={action ? "meta-row meta-row-with-action" : "meta-row"}>
      <dt>{label}</dt>
      <dd title={title}>{value}</dd>
      {action ? <div className="meta-row-action">{action}</div> : null}
    </div>
  );
}

function getTabLabel(tab: DetailTab): string {
  if (tab === "prompt") {
    return "Prompt";
  }
  if (tab === "context") {
    return "Context";
  }
  return "Details";
}

function getPromptSourceLabel(image: ImageRecord): string {
  if (image.promptSource === "revised_prompt") {
    return "Exact prompt";
  }
  if (image.promptSource === "cached") {
    return "Cached prompt";
  }
  return "No prompt";
}

function getContextSourceLabel(
  context: ImageContextResult | null,
  loading: boolean,
  error: string | null
): string {
  if (loading) {
    return "Loading";
  }
  if (error || !context || context.status === "unavailable") {
    return "Unavailable";
  }
  if (context.status === "cached" || context.source === "cached") {
    return "Cached by CoMate";
  }
  return "Local session log";
}

function getContextSourceClass(
  context: ImageContextResult | null,
  loading: boolean,
  error: string | null
): string {
  if (loading) {
    return "context-loading";
  }
  if (error || !context || context.status === "unavailable") {
    return "context-unavailable";
  }
  return context.status === "cached" || context.source === "cached" ? "context-cached" : "context-live";
}

function formatContextRole(role: ImageContextResult["messages"][number]["role"]): string {
  if (role === "user") {
    return "User";
  }
  if (role === "assistant") {
    return "Assistant";
  }
  if (role === "tool") {
    return "Tool";
  }
  return "System";
}

function formatContextForClipboard(context: ImageContextResult): string {
  const sections = splitContextMessages(context);
  const formatMessage = (message: ImageContextResult["messages"][number]) => {
      const timestamp = message.timestamp ? ` · ${formatFullDate(message.timestamp)}` : "";
      return `${formatContextRole(message.role)}${timestamp}\n${message.text}`;
  };

  return [
    ...sections.before.map(formatMessage),
    "Image generated here",
    ...sections.after.map(formatMessage)
  ].join("\n\n");
}

function splitContextMessages(context: ImageContextResult | null): {
  after: ImageContextResult["messages"];
  before: ImageContextResult["messages"];
} {
  if (!context) {
    return { after: [], before: [] };
  }

  const anchorMs = context.anchorTimestamp ? Date.parse(context.anchorTimestamp) : Number.NaN;
  if (!Number.isFinite(anchorMs)) {
    const splitIndex = Math.min(3, context.messages.length);
    return {
      before: context.messages.slice(0, splitIndex),
      after: context.messages.slice(splitIndex)
    };
  }

  const before: ImageContextResult["messages"] = [];
  const after: ImageContextResult["messages"] = [];
  for (const message of context.messages) {
    const messageMs = message.timestamp ? Date.parse(message.timestamp) : Number.NaN;
    if (Number.isFinite(messageMs) && messageMs > anchorMs) {
      after.push(message);
    } else {
      before.push(message);
    }
  }

  return { after, before };
}

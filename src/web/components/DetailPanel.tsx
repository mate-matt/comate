import { Copy, ExternalLink, FolderOpen } from "lucide-react";

import type { ImageRecord } from "../../shared/types.js";
import { imageFileUrl, openImage } from "../api/client.js";
import { formatBytes, formatFullDate, middleEllipsis } from "../utils/format.js";

interface DetailPanelProps {
  collapsed?: boolean;
  image: ImageRecord | null;
}

export function DetailPanel({ collapsed = false, image }: DetailPanelProps) {
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

  return (
    <aside className="detail-panel">
      <div className="detail-image-frame">
        <img src={imageFileUrl(image)} alt={image.threadName ?? image.fileName} />
      </div>

      <div className="detail-actions">
        <button onClick={() => openImage(image.id, "openFile")}>
          <ExternalLink size={16} />
          Open
        </button>
        <button onClick={() => openImage(image.id, "revealFile")}>
          <FolderOpen size={16} />
          Folder
        </button>
        <button onClick={() => navigator.clipboard.writeText(image.filePath)}>
          <Copy size={16} />
          Path
        </button>
      </div>

      <section className="detail-section prompt-section">
        <div className="detail-section-heading">
          <span>Prompt</span>
          <button
            className="detail-copy-button"
            disabled={!image.prompt}
            aria-label="Copy prompt"
            onClick={() => image.prompt && navigator.clipboard.writeText(image.prompt)}
          >
            <Copy size={14} />
          </button>
        </div>
        <pre>{image.prompt ?? "No prompt"}</pre>
      </section>

      <section className="detail-section metadata-section">
        <div className="detail-section-heading">
          <span>Details</span>
        </div>
        <dl className="meta-list">
          <Meta label="Title" value={image.threadName ?? "Untitled"} />
          <Meta label="Date" value={formatFullDate(image.generatedAt ?? image.fileModifiedAt)} />
          <Meta label="File" value={middleEllipsis(image.fileName, 42)} title={image.fileName} />
          <Meta label="Size" value={`${dimensions} · ${formatBytes(image.sizeBytes)}`} />
          <Meta label="Session" value={middleEllipsis(image.sessionId, 24)} title={image.sessionId} />
        </dl>
      </section>
    </aside>
  );
}

function Meta({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="meta-row">
      <dt>{label}</dt>
      <dd title={title}>{value}</dd>
    </div>
  );
}

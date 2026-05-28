import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  X
} from "lucide-react";

import type {
  ImageContextResult,
  ImagePromptInferenceRecord,
  ImageRecord,
  PromptInferenceTaskStatus,
  PromptInferenceTaskSummary,
  PromptInferenceTasksResponse,
  PromptInferenceTaskView,
  PromptInferenceLanguage,
  PromptInferenceTextPair
} from "../../shared/types.js";
import { imageFileUrl, imageThumbnailUrl, openImage } from "../api/client.js";
import { formatBytes, formatFullDate, middleEllipsis } from "../utils/format.js";

type DetailTab = "prompt" | "context" | "details";
type DetailPanelPage = "detail" | "promptTasks";

const EMPTY_PROMPT_TASKS: PromptInferenceTasksResponse = {
  summary: {
    active: 0,
    canceled: 0,
    failed: 0,
    queued: 0,
    ready: 0,
    running: 0,
    total: 0
  },
  tasks: []
};

const PROMPT_TASK_SECTIONS: Array<{
  emptyLabel: string;
  statuses: PromptInferenceTaskStatus[];
  title: string;
}> = [
  { title: "Running", statuses: ["running"], emptyLabel: "No running prompt tasks." },
  { title: "Queued", statuses: ["queued"], emptyLabel: "No queued prompt tasks." },
  { title: "Needs attention", statuses: ["failed"], emptyLabel: "No failed prompt tasks." },
  { title: "Recent", statuses: ["ready", "canceled"], emptyLabel: "No recent prompt tasks." }
];

interface DetailPanelProps {
  collapsed?: boolean;
  context?: ImageContextResult | null;
  contextError?: string | null;
  contextLoading?: boolean;
  image: ImageRecord | null;
  initialPage?: DetailPanelPage;
  onCancelPromptTask?: (task: PromptInferenceTaskView) => void | Promise<void>;
  onCopyImage?: (image: ImageRecord) => void | Promise<void>;
  onInferPrompt?: () => void | Promise<void>;
  onRefreshPromptTasks?: () => void | Promise<void>;
  onRetryPromptTask?: (task: PromptInferenceTaskView) => void | Promise<void>;
  onViewPromptTaskImage?: (image: ImageRecord) => void;
  promptInference?: ImagePromptInferenceRecord | null;
  promptInferenceError?: string | null;
  promptInferenceLoading?: boolean;
  promptInferenceSubmitting?: boolean;
  promptTask?: PromptInferenceTaskView | null;
  promptTasks?: PromptInferenceTasksResponse;
  promptTasksError?: string | null;
}

export function DetailPanel({
  collapsed = false,
  context = null,
  contextError = null,
  contextLoading = false,
  image,
  initialPage = "detail",
  onCancelPromptTask,
  onCopyImage,
  onInferPrompt,
  onRefreshPromptTasks,
  onRetryPromptTask,
  onViewPromptTaskImage,
  promptInference = null,
  promptInferenceError = null,
  promptInferenceLoading = false,
  promptInferenceSubmitting = false,
  promptTask = null,
  promptTasks = EMPTY_PROMPT_TASKS,
  promptTasksError = null
}: DetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("prompt");
  const [page, setPage] = useState<DetailPanelPage>(initialPage);

  useEffect(() => {
    if (image) {
      setActiveTab("prompt");
    }
  }, [image?.id]);

  useEffect(() => {
    setPage(initialPage);
  }, [initialPage]);

  if (collapsed) {
    return <aside className="detail-panel collapsed" aria-hidden="true" />;
  }

  if (page === "promptTasks") {
    return (
      <aside className="detail-panel">
        <PromptTasksPage
          error={promptTasksError}
          tasks={promptTasks}
          onBack={() => setPage("detail")}
          onCancel={onCancelPromptTask}
          onRefresh={onRefreshPromptTasks}
          onRetry={onRetryPromptTask}
          onView={(task) => {
            onViewPromptTaskImage?.(task.image);
            setPage("detail");
            setActiveTab("prompt");
          }}
        />
      </aside>
    );
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
      <PromptTasksEntry error={promptTasksError} tasks={promptTasks} onOpen={() => setPage("promptTasks")} />

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
          {activeTab === "prompt" ? (
            <PromptPanel
              image={image}
              inference={promptInference}
              inferenceError={promptInferenceError}
              inferenceLoading={promptInferenceLoading}
              inferenceSubmitting={promptInferenceSubmitting}
              onInferPrompt={onInferPrompt}
              onCancelPromptTask={onCancelPromptTask}
              promptTask={promptTask}
            />
          ) : null}
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

function PromptTasksEntry({
  error,
  onOpen,
  tasks
}: {
  error: string | null;
  onOpen: () => void;
  tasks: PromptInferenceTasksResponse;
}) {
  const hasTasks = tasks.summary.total > 0;
  if (!hasTasks && !error) {
    return null;
  }

  const active = tasks.summary.active > 0;
  const summary = formatPromptTaskEntrySummary(tasks.summary, error);

  return (
    <button className="prompt-task-entry" type="button" aria-label="Open Codex prompt tasks" onClick={onOpen}>
      <span className={active ? "prompt-task-entry-icon running" : error ? "prompt-task-entry-icon failed" : "prompt-task-entry-icon"}>
        {active ? <LoaderCircle size={19} /> : error ? <AlertCircle size={18} /> : <Sparkles size={18} />}
      </span>
      <span className="prompt-task-entry-copy">
        <strong>Codex prompts</strong>
        <span>{summary}</span>
      </span>
      <ChevronRight size={18} />
    </button>
  );
}

function PromptTasksPage({
  error,
  onBack,
  onCancel,
  onRefresh,
  onRetry,
  onView,
  tasks
}: {
  error: string | null;
  onBack: () => void;
  onCancel?: (task: PromptInferenceTaskView) => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
  onRetry?: (task: PromptInferenceTaskView) => void | Promise<void>;
  onView: (task: PromptInferenceTaskView) => void;
  tasks: PromptInferenceTasksResponse;
}) {
  return (
    <div className="prompt-task-page">
      <header className="prompt-task-page-header">
        <button className="prompt-task-back" type="button" aria-label="Back to image detail" onClick={onBack}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <strong>Codex prompt tasks</strong>
          <span>{formatPromptTaskEntrySummary(tasks.summary, error)}</span>
        </div>
        <button
          className="prompt-task-refresh"
          type="button"
          aria-label="Refresh Codex prompt tasks"
          disabled={!onRefresh}
          onClick={() => void onRefresh?.()}
        >
          <RefreshCw size={15} />
        </button>
      </header>

      <PromptTaskSummaryBar summary={tasks.summary} />
      {error ? <div className="prompt-task-error">{error}</div> : null}
      {tasks.summary.total === 0 ? (
        <div className="prompt-task-empty">
          <Sparkles size={18} />
          <strong>No Codex prompt tasks</strong>
          <span>Images without exact prompts will appear here when Codex starts inferring.</span>
        </div>
      ) : (
        <div className="prompt-task-sections">
          {PROMPT_TASK_SECTIONS.map((section) => {
            const sectionTasks = tasks.tasks.filter((task) => section.statuses.includes(task.status));
            return (
              <PromptTaskSection
                key={section.title}
                emptyLabel={section.emptyLabel}
                tasks={sectionTasks}
                title={section.title}
                onCancel={onCancel}
                onRetry={onRetry}
                onView={onView}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function PromptTaskSummaryBar({ summary }: { summary: PromptInferenceTaskSummary }) {
  if (summary.total === 0) {
    return null;
  }

  const chips = [
    ["Running", summary.running],
    ["Queued", summary.queued],
    ["Ready", summary.ready],
    ["Failed", summary.failed]
  ].filter(([, count]) => Number(count) > 0);

  return (
    <div className="prompt-task-summary-bar" aria-label="Codex prompt task summary">
      {chips.map(([label, count]) => (
        <span key={label}>
          <strong>{count}</strong>
          {label}
        </span>
      ))}
    </div>
  );
}

function PromptTaskSection({
  emptyLabel,
  onCancel,
  onRetry,
  onView,
  tasks,
  title
}: {
  emptyLabel: string;
  onCancel?: (task: PromptInferenceTaskView) => void | Promise<void>;
  onRetry?: (task: PromptInferenceTaskView) => void | Promise<void>;
  onView: (task: PromptInferenceTaskView) => void;
  tasks: PromptInferenceTaskView[];
  title: string;
}) {
  return (
    <section className="prompt-task-section">
      <div className="prompt-task-section-heading">
        <strong>{title}</strong>
        <span>{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <p>{emptyLabel}</p>
      ) : (
        <ol className="prompt-task-list">
          {tasks.map((task) => (
            <PromptTaskRow key={task.id} task={task} onCancel={onCancel} onRetry={onRetry} onView={onView} />
          ))}
        </ol>
      )}
    </section>
  );
}

function PromptTaskRow({
  onCancel,
  onRetry,
  onView,
  task
}: {
  onCancel?: (task: PromptInferenceTaskView) => void | Promise<void>;
  onRetry?: (task: PromptInferenceTaskView) => void | Promise<void>;
  onView: (task: PromptInferenceTaskView) => void;
  task: PromptInferenceTaskView;
}) {
  return (
    <li className={`prompt-task-row status-${task.status}`}>
      <button className="prompt-task-thumb" type="button" aria-label="View task image" onClick={() => onView(task)}>
        <img src={imageThumbnailUrl(task.image)} alt={task.image.threadName ?? task.image.fileName} loading="lazy" />
      </button>
      <div className="prompt-task-row-main">
        <strong title={task.image.threadName ?? task.image.fileName}>{task.image.threadName ?? task.image.fileName}</strong>
        <span>{formatPromptTaskMeta(task)}</span>
      </div>
      <span className={`prompt-task-status status-${task.status}`}>{getPromptTaskStatusIcon(task.status)}{getPromptTaskStatusLabel(task)}</span>
      <div className="prompt-task-row-actions">
        <button type="button" onClick={() => onView(task)}>
          View
        </button>
        {task.status === "queued" ? (
          <button type="button" disabled={!onCancel} onClick={() => void onCancel?.(task)}>
            Cancel
          </button>
        ) : null}
        {task.status === "failed" ? (
          <button type="button" disabled={!onRetry} onClick={() => void onRetry?.(task)}>
            Retry
          </button>
        ) : null}
      </div>
    </li>
  );
}

function PromptPanel({
  image,
  inference,
  inferenceError,
  inferenceLoading,
  inferenceSubmitting,
  onCancelPromptTask,
  onInferPrompt,
  promptTask
}: {
  image: ImageRecord;
  inference: ImagePromptInferenceRecord | null;
  inferenceError: string | null;
  inferenceLoading: boolean;
  inferenceSubmitting: boolean;
  onCancelPromptTask?: (task: PromptInferenceTaskView) => void | Promise<void>;
  onInferPrompt?: () => void | Promise<void>;
  promptTask: PromptInferenceTaskView | null;
}) {
  const [language, setLanguage] = useState<PromptInferenceLanguage>("zh");
  const taskBusy = promptTask?.status === "queued" || promptTask?.status === "running";
  const busy = inferenceLoading || inferenceSubmitting || taskBusy;
  const hasInferredPrompt = Boolean(!image.prompt && inference?.status === "ready" && inference.result);
  const copyText = image.prompt
    ? image.prompt
    : hasInferredPrompt && inference
      ? formatPromptInferenceForClipboard(inference, language)
      : "";

  return (
    <>
      <div className="detail-tab-toolbar">
        <div className="detail-source-stack">
          <span>Source</span>
          <small className={getPromptPillClass(image, inference, busy, inferenceError, promptTask)}>
            {getPromptSourceLabel(image, inference, busy, inferenceError, promptTask)}
          </small>
        </div>
        {!image.prompt && hasInferredPrompt ? (
          <LanguageToggle language={language} onLanguageChange={setLanguage} />
        ) : null}
        {!image.prompt && hasInferredPrompt ? (
          <button
            className="detail-inline-action"
            disabled={busy || !onInferPrompt}
            aria-label="Regenerate inferred prompt"
            title="Regenerate inferred prompt"
            onClick={() => void onInferPrompt?.()}
          >
            <RefreshCw size={13} />
            {busy ? "Working" : "Again"}
          </button>
        ) : null}
        <button
          className="detail-copy-button"
          disabled={!copyText}
          aria-label="Copy prompt"
          title="Copy prompt"
          onClick={() => copyText && navigator.clipboard.writeText(copyText)}
        >
          <Copy size={14} />
        </button>
      </div>
      <PromptBody
        image={image}
        inference={inference}
        inferenceError={inferenceError}
        inferenceLoading={inferenceLoading}
        inferenceSubmitting={inferenceSubmitting}
        language={language}
        onCancelPromptTask={onCancelPromptTask}
        onInferPrompt={onInferPrompt}
        promptTask={promptTask}
      />
    </>
  );
}

function LanguageToggle({
  language,
  onLanguageChange
}: {
  language: PromptInferenceLanguage;
  onLanguageChange: (language: PromptInferenceLanguage) => void;
}) {
  return (
    <div className="prompt-language-toggle" aria-label="Prompt language">
      <button
        className={language === "zh" ? "active" : ""}
        type="button"
        aria-pressed={language === "zh"}
        onClick={() => onLanguageChange("zh")}
      >
        中文
      </button>
      <button
        className={language === "en" ? "active" : ""}
        type="button"
        aria-pressed={language === "en"}
        onClick={() => onLanguageChange("en")}
      >
        English
      </button>
    </div>
  );
}

function PromptBody({
  image,
  inference,
  inferenceError,
  inferenceLoading,
  inferenceSubmitting,
  language,
  onCancelPromptTask,
  onInferPrompt,
  promptTask
}: {
  image: ImageRecord;
  inference: ImagePromptInferenceRecord | null;
  inferenceError: string | null;
  inferenceLoading: boolean;
  inferenceSubmitting: boolean;
  language: PromptInferenceLanguage;
  onCancelPromptTask?: (task: PromptInferenceTaskView) => void | Promise<void>;
  onInferPrompt?: () => void | Promise<void>;
  promptTask: PromptInferenceTaskView | null;
}) {
  if (image.prompt) {
    return <pre className="prompt-reader">{image.prompt}</pre>;
  }

  if (promptTask?.status === "queued") {
    return (
      <div className="prompt-inference-state working">
        <Clock3 size={19} />
        <strong>Queued for Codex</strong>
        <span>{promptTask.position ? `Queue position #${promptTask.position}` : "Waiting for the current prompt task to finish."}</span>
        <button type="button" disabled={!onCancelPromptTask} onClick={() => void onCancelPromptTask?.(promptTask)}>
          <X size={13} />
          Cancel
        </button>
      </div>
    );
  }

  if (promptTask?.status === "running" || inferenceLoading || inferenceSubmitting) {
    return (
      <div className="prompt-inference-state working">
        <LoaderCircle className="spin" size={20} />
        <strong>Codex is inferring...</strong>
        <span>Building a structured bilingual prompt from the local image.</span>
      </div>
    );
  }

  if (inference?.status === "ready" && inference.result) {
    return <PromptInferenceReader inference={inference} language={language} />;
  }

  if (inferenceError || inference?.status === "failed") {
    return (
      <div className="prompt-inference-state error">
        <strong>Inference failed</strong>
        <span>{inferenceError ?? inference?.error ?? "Codex prompt inference failed."}</span>
        <button type="button" disabled={!onInferPrompt} onClick={() => void onInferPrompt?.()}>
          <RefreshCw size={13} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="prompt-inference-state empty">
      <strong>No exact prompt found</strong>
      <span>Use Codex to infer a structured bilingual prompt from this local image.</span>
      <button type="button" disabled={!onInferPrompt} onClick={() => void onInferPrompt?.()}>
        <Sparkles size={13} />
        Infer prompt
      </button>
    </div>
  );
}

function formatPromptTaskEntrySummary(summary: PromptInferenceTaskSummary, error: string | null): string {
  if (error) {
    return "Unable to load tasks";
  }
  if (summary.active > 0) {
    return `${summary.running} running · ${summary.queued} queued`;
  }
  if (summary.failed > 0) {
    return `${summary.failed} needs attention · ${summary.ready} ready`;
  }
  if (summary.ready > 0) {
    return `${summary.ready} ready`;
  }
  if (summary.canceled > 0) {
    return `${summary.canceled} canceled`;
  }
  return "No tasks";
}

function formatPromptTaskMeta(task: PromptInferenceTaskView): string {
  if (task.status === "queued") {
    return task.position ? `Queue #${task.position} · ${formatFullDate(task.queuedAt)}` : `Queued · ${formatFullDate(task.queuedAt)}`;
  }
  if (task.status === "running") {
    return task.startedAt ? `Started ${formatFullDate(task.startedAt)}` : "Running";
  }
  if (task.status === "failed") {
    return task.error ? middleEllipsis(task.error, 52) : "Inference failed";
  }
  if (task.status === "canceled") {
    return "Canceled";
  }
  return task.inference?.model ? `Ready · ${task.inference.model}` : "Ready";
}

function getPromptTaskStatusLabel(task: PromptInferenceTaskView): string {
  if (task.status === "queued") {
    return task.position ? `Queued #${task.position}` : "Queued";
  }
  if (task.status === "running") {
    return "Running";
  }
  if (task.status === "ready") {
    return "Ready";
  }
  if (task.status === "failed") {
    return "Failed";
  }
  return "Canceled";
}

function getPromptTaskStatusIcon(status: PromptInferenceTaskStatus): ReactNode {
  if (status === "running") {
    return <LoaderCircle className="spin" size={12} />;
  }
  if (status === "queued") {
    return <Clock3 size={12} />;
  }
  if (status === "ready") {
    return <CheckCircle2 size={12} />;
  }
  if (status === "failed") {
    return <AlertCircle size={12} />;
  }
  return <X size={12} />;
}

function PromptInferenceReader({
  inference,
  language
}: {
  inference: ImagePromptInferenceRecord;
  language: PromptInferenceLanguage;
}) {
  const result = inference.result;
  if (!result) {
    return <div className="prompt-inference-state">No inferred prompt.</div>;
  }

  return (
    <div className="prompt-inference-reader">
      <section className="prompt-inference-main">
        <h3>Prompt</h3>
        <p>{result.prompt[language]}</p>
      </section>
      {result.negativePrompt ? (
        <section className="prompt-inference-main quiet">
          <h3>Negative</h3>
          <p>{result.negativePrompt[language]}</p>
        </section>
      ) : null}
      <div className="prompt-inference-structure">
        <PromptInferenceField label="Subject" value={result.structure.subject} language={language} />
        <PromptInferenceField label="Style" value={result.structure.style} language={language} />
        <PromptInferenceField label="Composition" value={result.structure.composition} language={language} />
        <PromptInferenceField label="Lighting" value={result.structure.lighting} language={language} />
        <PromptInferenceField label="Color" value={result.structure.colorPalette} language={language} />
        <PromptInferenceField label="Technical" value={result.structure.technicalNotes} language={language} />
      </div>
    </div>
  );
}

function PromptInferenceField({
  label,
  language,
  value
}: {
  label: string;
  language: PromptInferenceLanguage;
  value: PromptInferenceTextPair;
}) {
  return (
    <section className="prompt-inference-field">
      <h3>{label}</h3>
      <p>{value[language]}</p>
    </section>
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

function getPromptSourceLabel(
  image: ImageRecord,
  inference: ImagePromptInferenceRecord | null,
  loading: boolean,
  error: string | null,
  task: PromptInferenceTaskView | null = null
): string {
  if (image.promptSource === "revised_prompt") {
    return "Exact prompt";
  }
  if (image.promptSource === "cached") {
    return "Cached prompt";
  }
  if (task?.status === "queued") {
    return "Queued";
  }
  if (task?.status === "running") {
    return "Inferring";
  }
  if (loading) {
    return "Inferring";
  }
  if (error || inference?.status === "failed") {
    return "Inference failed";
  }
  if (inference?.status === "ready") {
    return "Codex inferred";
  }
  return "No prompt";
}

function getPromptPillClass(
  image: ImageRecord,
  inference: ImagePromptInferenceRecord | null,
  loading: boolean,
  error: string | null,
  task: PromptInferenceTaskView | null = null
): string {
  if (image.prompt) {
    return `detail-source-pill source-${image.promptSource}`;
  }
  if (task?.status === "queued") {
    return "detail-source-pill prompt-inference-queued";
  }
  if (task?.status === "running") {
    return "detail-source-pill prompt-inference-loading";
  }
  if (loading) {
    return "detail-source-pill prompt-inference-loading";
  }
  if (error || inference?.status === "failed") {
    return "detail-source-pill prompt-inference-failed";
  }
  if (inference?.status === "ready") {
    return "detail-source-pill prompt-inference-ready";
  }
  return "detail-source-pill source-none";
}

function formatPromptInferenceForClipboard(
  inference: ImagePromptInferenceRecord,
  language: PromptInferenceLanguage
): string {
  const result = inference.result;
  if (!result) {
    return "";
  }

  const lines = [
    "Prompt",
    result.prompt[language],
    result.negativePrompt ? `\nNegative\n${result.negativePrompt[language]}` : "",
    "\nStructure",
    `Subject: ${result.structure.subject[language]}`,
    `Style: ${result.structure.style[language]}`,
    `Composition: ${result.structure.composition[language]}`,
    `Lighting: ${result.structure.lighting[language]}`,
    `Color: ${result.structure.colorPalette[language]}`,
    `Technical: ${result.structure.technicalNotes[language]}`
  ].filter(Boolean);

  return lines.join("\n");
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

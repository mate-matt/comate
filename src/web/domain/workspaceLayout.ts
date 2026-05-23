import type { DatePreset, ImageRecord, PromptState } from "../../shared/types.js";

export type WorkspacePanelState = "expanded" | "collapsed";

export interface WorkspacePanelLayout {
  left: WorkspacePanelState;
  right: WorkspacePanelState;
}

export interface ImageWorkspaceHeaderInput {
  datePreset: DatePreset;
  imageTotal: number;
  loading: boolean;
  promptState: PromptState;
  query: string;
  selectedImage: ImageRecord | null;
  sessionId: string | undefined;
}

export interface WorkspaceHeaderCopy {
  title: string;
  context: string;
}

const IMAGE_WORKSPACE_TITLE = "图片浏览";

const DATE_LABELS: Record<DatePreset, string> = {
  all: "All images",
  today: "Today",
  week: "Last 7 days",
  month: "Last 30 days"
};

const PROMPT_LABELS: Record<PromptState, string> = {
  all: "",
  withPrompt: "with prompts",
  withoutPrompt: "without prompts"
};

export function togglePanelState(state: WorkspacePanelState): WorkspacePanelState {
  return state === "expanded" ? "collapsed" : "expanded";
}

export function getWorkspaceClassName(layout: WorkspacePanelLayout): string {
  const classes = ["workspace"];
  if (layout.left === "collapsed") {
    classes.push("left-collapsed");
  }
  if (layout.right === "collapsed") {
    classes.push("right-collapsed");
  }
  return classes.join(" ");
}

export function getImageWorkspaceHeader(input: ImageWorkspaceHeaderInput): WorkspaceHeaderCopy {
  const filters = [DATE_LABELS[input.datePreset], PROMPT_LABELS[input.promptState]]
    .filter(Boolean)
    .join(" · ");
  const count = input.loading ? "Loading" : `${formatCount(input.imageTotal, "image")}`;
  const query = input.query.trim() ? `Search: ${input.query.trim()}` : "";
  const session = input.sessionId ? "session scoped" : "";
  const context = [count, filters, query, session].filter(Boolean).join(" · ");

  return {
    title: IMAGE_WORKSPACE_TITLE,
    context
  };
}

function formatCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

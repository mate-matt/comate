import fs from "node:fs/promises";
import crypto from "node:crypto";

import type {
  ImagePromptInferenceRecord,
  ImageRecord,
  PromptInferenceTaskSummary,
  PromptInferenceTasksResponse,
  PromptInferenceTaskStatus,
  PromptInferenceTaskView
} from "../../shared/types.js";
import type { CodexPromptInferenceRunner, ImageIndexStore } from "../domain/types.js";

const DEFAULT_PROMPT_INFERENCE_TIMEOUT_MS = 120_000;
const RECENT_TASK_LIMIT = 50;

export interface PromptInferenceOptions {
  regenerate?: boolean;
}

interface InternalPromptInferenceTask {
  id: string;
  image: ImageRecord;
  regenerate: boolean;
  status: PromptInferenceTaskStatus;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  inference: ImagePromptInferenceRecord | null;
  error: string | null;
  completion: Promise<ImagePromptInferenceRecord>;
  reject: (error: Error) => void;
  resolve: (inference: ImagePromptInferenceRecord) => void;
}

export class PromptInferenceServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
  }
}

export class PromptInferenceService {
  private activeTaskId: string | null = null;
  private readonly pendingTaskIds: string[] = [];
  private readonly tasks = new Map<string, InternalPromptInferenceTask>();

  constructor(
    private readonly index: ImageIndexStore,
    private readonly runner: CodexPromptInferenceRunner,
    private readonly timeoutMs = DEFAULT_PROMPT_INFERENCE_TIMEOUT_MS
  ) {}

  get(imageId: string): ImagePromptInferenceRecord | null {
    this.assertImageExists(imageId);
    return this.index.getPromptInference(imageId);
  }

  async infer(imageId: string, options: PromptInferenceOptions = {}): Promise<ImagePromptInferenceRecord> {
    const task = this.enqueue(imageId, options);
    const internalTask = this.tasks.get(task.id);
    if (!internalTask) {
      throw new PromptInferenceServiceError("Prompt inference task was not found.", 404);
    }
    return internalTask.completion;
  }

  enqueue(imageId: string, options: PromptInferenceOptions = {}): PromptInferenceTaskView {
    const image = this.assertImageExists(imageId);
    if (image.hasPrompt) {
      throw new PromptInferenceServiceError("This image already has an exact prompt.", 409);
    }

    const regenerate = options.regenerate === true;
    if (!regenerate) {
      const activeTask = this.findActiveTaskByImageId(imageId);
      if (activeTask) {
        return this.toTaskView(activeTask);
      }
    }

    const cached = this.index.getPromptInference(imageId);
    if (!regenerate && cached?.status === "ready") {
      return this.toTaskView(this.createCompletedTask(image, cached, false));
    }

    const task = this.createQueuedTask(image, regenerate);
    this.tasks.set(task.id, task);
    this.pendingTaskIds.push(task.id);
    queueMicrotask(() => this.startNextTask());
    return this.toTaskView(task);
  }

  listTasks(): PromptInferenceTasksResponse {
    const tasks = Array.from(this.tasks.values())
      .map((task) => this.toTaskView(task))
      .sort(compareTaskViews);
    return {
      summary: summarizeTasks(tasks),
      tasks
    };
  }

  cancel(taskId: string): PromptInferenceTaskView {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new PromptInferenceServiceError("Prompt inference task not found.", 404);
    }
    if (task.status !== "queued") {
      throw new PromptInferenceServiceError("Only queued prompt inference tasks can be canceled.", 409);
    }

    const now = new Date().toISOString();
    task.status = "canceled";
    task.finishedAt = now;
    task.updatedAt = now;
    task.error = "Canceled";
    this.removePendingTask(task.id);
    task.reject(new PromptInferenceServiceError("Prompt inference task was canceled.", 409));
    this.pruneFinishedTasks();
    return this.toTaskView(task);
  }

  private async runInference(imageId: string): Promise<ImagePromptInferenceRecord> {
    const image = this.assertImageExists(imageId);
    const existing = this.index.getPromptInference(imageId);

    try {
      await fs.access(image.filePath);
    } catch {
      const failed = this.createRecord(imageId, existing, {
        error: "Image file is missing.",
        status: "failed"
      });
      this.index.replacePromptInference(failed);
      return failed;
    }

    const health = await this.runner.checkHealth();
    if (!health.available) {
      const failed = this.createRecord(imageId, existing, {
        error: health.error ?? "Codex CLI is not available.",
        status: "failed"
      });
      this.index.replacePromptInference(failed);
      return failed;
    }

    try {
      const output = await this.runner.inferPrompt({
        context: this.index.getImageContext(imageId),
        image,
        timeoutMs: this.timeoutMs
      });
      const ready = this.createRecord(imageId, existing, {
        confidence: output.confidence,
        error: null,
        model: output.model,
        result: output.result,
        status: "ready"
      });
      this.index.replacePromptInference(ready);
      return ready;
    } catch (error) {
      const failed = this.createRecord(imageId, existing, {
        error: error instanceof Error ? error.message : "Codex prompt inference failed.",
        status: "failed"
      });
      this.index.replacePromptInference(failed);
      return failed;
    }
  }

  private assertImageExists(imageId: string) {
    const image = this.index.getById(imageId);
    if (!image) {
      throw new PromptInferenceServiceError("Image not found.", 404);
    }
    return image;
  }

  private createQueuedTask(image: ImageRecord, regenerate: boolean): InternalPromptInferenceTask {
    const now = new Date().toISOString();
    let resolveTask: (inference: ImagePromptInferenceRecord) => void = () => undefined;
    let rejectTask: (error: Error) => void = () => undefined;
    const completion = new Promise<ImagePromptInferenceRecord>((resolve, reject) => {
      resolveTask = resolve;
      rejectTask = reject;
    });
    completion.catch(() => undefined);

    return {
      id: crypto.randomUUID(),
      image,
      regenerate,
      status: "queued",
      queuedAt: now,
      startedAt: null,
      finishedAt: null,
      updatedAt: now,
      inference: null,
      error: null,
      completion,
      reject: rejectTask,
      resolve: resolveTask
    };
  }

  private createCompletedTask(
    image: ImageRecord,
    inference: ImagePromptInferenceRecord,
    regenerate: boolean
  ): InternalPromptInferenceTask {
    const existingTask = Array.from(this.tasks.values())
      .filter((task) => task.image.id === image.id && task.status === inference.status && task.inference?.updatedAt === inference.updatedAt)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    if (existingTask) {
      return existingTask;
    }

    const now = inference.updatedAt || new Date().toISOString();
    let resolveTask: (nextInference: ImagePromptInferenceRecord) => void = () => undefined;
    let rejectTask: (error: Error) => void = () => undefined;
    const completion = new Promise<ImagePromptInferenceRecord>((resolve, reject) => {
      resolveTask = resolve;
      rejectTask = reject;
    });
    resolveTask(inference);

    const task: InternalPromptInferenceTask = {
      id: crypto.randomUUID(),
      image,
      regenerate,
      status: inference.status,
      queuedAt: now,
      startedAt: now,
      finishedAt: now,
      updatedAt: now,
      inference,
      error: inference.error,
      completion,
      reject: rejectTask,
      resolve: resolveTask
    };
    this.tasks.set(task.id, task);
    this.pruneFinishedTasks();
    return task;
  }

  private findActiveTaskByImageId(imageId: string): InternalPromptInferenceTask | null {
    return Array.from(this.tasks.values()).find((task) => {
      return task.image.id === imageId && (task.status === "queued" || task.status === "running");
    }) ?? null;
  }

  private startNextTask(): void {
    if (this.activeTaskId) {
      return;
    }

    const task = this.takeNextQueuedTask();
    if (!task) {
      return;
    }

    const now = new Date().toISOString();
    task.status = "running";
    task.startedAt = now;
    task.updatedAt = now;
    this.activeTaskId = task.id;
    void this.finishTask(task);
  }

  private async finishTask(task: InternalPromptInferenceTask): Promise<void> {
    try {
      const inference = await this.runInference(task.image.id);
      const now = new Date().toISOString();
      task.inference = inference;
      task.status = inference.status;
      task.error = inference.error;
      task.finishedAt = now;
      task.updatedAt = now;
      task.resolve(inference);
    } catch (error) {
      const now = new Date().toISOString();
      task.status = "failed";
      task.error = error instanceof Error ? error.message : "Prompt inference failed.";
      task.finishedAt = now;
      task.updatedAt = now;
      task.reject(error instanceof Error ? error : new Error(task.error));
    } finally {
      if (this.activeTaskId === task.id) {
        this.activeTaskId = null;
      }
      this.pruneFinishedTasks();
      this.startNextTask();
    }
  }

  private takeNextQueuedTask(): InternalPromptInferenceTask | null {
    while (this.pendingTaskIds.length > 0) {
      const taskId = this.pendingTaskIds.shift()!;
      const task = this.tasks.get(taskId);
      if (task?.status === "queued") {
        return task;
      }
    }
    return null;
  }

  private removePendingTask(taskId: string): void {
    const index = this.pendingTaskIds.indexOf(taskId);
    if (index >= 0) {
      this.pendingTaskIds.splice(index, 1);
    }
  }

  private pruneFinishedTasks(): void {
    const finishedTasks = Array.from(this.tasks.values())
      .filter((task) => task.status !== "queued" && task.status !== "running")
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    for (const task of finishedTasks.slice(RECENT_TASK_LIMIT)) {
      this.tasks.delete(task.id);
    }
  }

  private toTaskView(task: InternalPromptInferenceTask): PromptInferenceTaskView {
    return {
      id: task.id,
      imageId: task.image.id,
      image: task.image,
      status: task.status,
      position: task.status === "queued" ? this.pendingTaskIds.indexOf(task.id) + 1 : null,
      queuedAt: task.queuedAt,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      updatedAt: task.updatedAt,
      regenerate: task.regenerate,
      inference: task.inference,
      error: task.error
    };
  }

  private createRecord(
    imageId: string,
    existing: ImagePromptInferenceRecord | null,
    values: Partial<ImagePromptInferenceRecord> & Pick<ImagePromptInferenceRecord, "status">
  ): ImagePromptInferenceRecord {
    const now = new Date().toISOString();
    return {
      imageId,
      status: values.status,
      source: "codex_agent",
      model: values.model ?? existing?.model ?? null,
      confidence: values.confidence ?? null,
      result: values.result ?? null,
      error: values.error ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
  }
}

function compareTaskViews(left: PromptInferenceTaskView, right: PromptInferenceTaskView): number {
  const leftRank = getTaskSortRank(left);
  const rightRank = getTaskSortRank(right);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  if (left.status === "queued" && right.status === "queued") {
    return (left.position ?? 0) - (right.position ?? 0);
  }
  return right.updatedAt.localeCompare(left.updatedAt);
}

function getTaskSortRank(task: PromptInferenceTaskView): number {
  if (task.status === "running") {
    return 0;
  }
  if (task.status === "queued") {
    return 1;
  }
  if (task.status === "failed") {
    return 2;
  }
  if (task.status === "ready") {
    return 3;
  }
  return 4;
}

function summarizeTasks(tasks: PromptInferenceTaskView[]): PromptInferenceTaskSummary {
  const summary: PromptInferenceTaskSummary = {
    active: 0,
    canceled: 0,
    failed: 0,
    queued: 0,
    ready: 0,
    running: 0,
    total: tasks.length
  };

  for (const task of tasks) {
    summary[task.status] += 1;
  }
  summary.active = summary.running + summary.queued;
  return summary;
}

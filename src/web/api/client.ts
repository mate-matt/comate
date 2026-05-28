import type {
  CapabilityScanResult,
  ImageContextResult,
  ImageCopyResult,
  ImagePromptInferenceResponse,
  ImageRecord,
  ImageSearchParams,
  ImageSearchResult,
  PromptInferenceTaskResponse,
  PromptInferenceTasksResponse,
  ReindexResult,
  RuntimeStatus
} from "../../shared/types.js";

export async function fetchRuntimeStatus(signal?: AbortSignal): Promise<RuntimeStatus> {
  const response = await fetch("/api/status", { signal });
  return readJson<RuntimeStatus>(response);
}

export async function fetchImages(params: ImageSearchParams, signal?: AbortSignal): Promise<ImageSearchResult> {
  const query = new URLSearchParams();
  setParam(query, "query", params.query);
  setParam(query, "datePreset", params.datePreset);
  setParam(query, "promptState", params.promptState);
  setParam(query, "sessionId", params.sessionId);
  setParam(query, "limit", params.limit?.toString());
  setParam(query, "offset", params.offset?.toString());

  const response = await fetch(`/api/images?${query.toString()}`, { signal });
  return readJson<ImageSearchResult>(response);
}

export async function fetchImageContext(id: string, signal?: AbortSignal): Promise<ImageContextResult> {
  const response = await fetch(`/api/images/${encodeURIComponent(id)}/context`, { signal });
  return readJson<ImageContextResult>(response);
}

export async function fetchImagePromptInference(
  id: string,
  signal?: AbortSignal
): Promise<ImagePromptInferenceResponse> {
  const response = await fetch(`/api/images/${encodeURIComponent(id)}/prompt-inference`, { signal });
  return readJson<ImagePromptInferenceResponse>(response);
}

export async function inferImagePrompt(id: string, regenerate = false): Promise<ImagePromptInferenceResponse> {
  const response = await fetch(`/api/images/${encodeURIComponent(id)}/prompt-inference`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ regenerate })
  });
  return readJson<ImagePromptInferenceResponse>(response);
}

export async function fetchPromptInferenceTasks(signal?: AbortSignal): Promise<PromptInferenceTasksResponse> {
  const response = await fetch("/api/prompt-inference/tasks", { signal });
  return readJson<PromptInferenceTasksResponse>(response);
}

export async function enqueueImagePromptInferenceTask(
  id: string,
  regenerate = false
): Promise<PromptInferenceTaskResponse> {
  const response = await fetch(`/api/images/${encodeURIComponent(id)}/prompt-inference/tasks`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ regenerate })
  });
  return readJson<PromptInferenceTaskResponse>(response);
}

export async function cancelPromptInferenceTask(id: string): Promise<PromptInferenceTaskResponse> {
  const response = await fetch(`/api/prompt-inference/tasks/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
  return readJson<PromptInferenceTaskResponse>(response);
}

export async function reindexLibrary(): Promise<ReindexResult> {
  const response = await fetch("/api/reindex", { method: "POST" });
  return readJson<ReindexResult>(response);
}

export async function fetchCapabilities(signal?: AbortSignal): Promise<CapabilityScanResult> {
  const response = await fetch("/api/capabilities", { signal });
  return readJson<CapabilityScanResult>(response);
}

export async function rescanCapabilities(): Promise<CapabilityScanResult> {
  const response = await fetch("/api/capabilities/rescan", { method: "POST" });
  return readJson<CapabilityScanResult>(response);
}

export async function openImage(id: string, action: "openFile" | "revealFile"): Promise<void> {
  const response = await fetch(`/api/images/${encodeURIComponent(id)}/open`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ action })
  });

  await readJson(response);
}

export async function copyImageToNativeClipboard(id: string): Promise<ImageCopyResult> {
  const response = await fetch(`/api/images/${encodeURIComponent(id)}/copy`, {
    method: "POST"
  });

  return readJson<ImageCopyResult>(response);
}

export async function openCapabilityPath(filePath: string, action: "openFile" | "revealFile"): Promise<void> {
  const response = await fetch("/api/capabilities/open", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ action, path: filePath })
  });

  await readJson(response);
}

export function imageFileUrl(record: ImageRecord): string {
  return `/api/images/${encodeURIComponent(record.id)}/file?v=${encodeURIComponent(record.fileModifiedAt)}`;
}

export function imageThumbnailUrl(record: ImageRecord): string {
  return `/api/images/${encodeURIComponent(record.id)}/thumb?v=${encodeURIComponent(record.fileModifiedAt)}&s=${record.sizeBytes}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const value = await response.json();
  if (!response.ok) {
    throw new Error(value.error ?? "Request failed.");
  }
  return value as T;
}

function setParam(query: URLSearchParams, key: string, value: string | number | undefined): void {
  if (value !== undefined && value !== "" && value !== "all") {
    query.set(key, String(value));
  }
}

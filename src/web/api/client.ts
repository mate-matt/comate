import type {
  CapabilityScanResult,
  ImageCopyResult,
  ImageRecord,
  ImageSearchParams,
  ImageSearchResult,
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

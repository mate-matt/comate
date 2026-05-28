import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type {
  CapabilityRecord,
  CapabilityScanResult,
  DatePreset,
  ImageContextResult,
  ImagePromptInferenceRecord,
  ImageRecord,
  ImageSearchResult,
  PromptInferenceTasksResponse,
  PromptInferenceTaskView,
  PromptState,
  RuntimeStatus
} from "../shared/types.js";
import {
  cancelPromptInferenceTask,
  enqueueImagePromptInferenceTask,
  fetchCapabilities,
  fetchImageContext,
  fetchImagePromptInference,
  fetchImages,
  fetchPromptInferenceTasks,
  fetchRuntimeStatus,
  copyImageToNativeClipboard,
  openCapabilityPath,
  reindexLibrary,
  rescanCapabilities
} from "./api/client.js";
import { CapabilityInspector } from "./components/CapabilityInspector.js";
import { CapabilityWorkspace } from "./components/CapabilityWorkspace.js";
import { DetailPanel } from "./components/DetailPanel.js";
import { GalleryPane } from "./components/GalleryPane.js";
import { GlobalRail } from "./components/GlobalRail.js";
import { SearchOverlay } from "./components/SearchOverlay.js";
import { Sidebar } from "./components/Sidebar.js";
import { SidebarResizeHandle } from "./components/SidebarResizeHandle.js";
import { StartupScreen, type StartupScreenMode } from "./components/StartupScreen.js";
import { WorkspaceBar } from "./components/WorkspaceBar.js";
import { getSidebarWidthCssValue, SIDEBAR_WIDTH_CONFIG } from "./domain/sidebarResize.js";
import { filterCapabilities, getSelectedCapability } from "./domain/capabilityView.js";
import {
  canLoadNextImagePage,
  IMAGE_PAGE_SIZE,
  mergeImagePages
} from "./domain/imagePagination.js";
import {
  copyImageBinaryToClipboard,
  getImageClipboardRuntime,
  shouldHandleImageCopyShortcut
} from "./domain/imageClipboard.js";
import { ensureImageInResult } from "./domain/imageSelection.js";
import { type AppModule, type CapabilitySection, getModuleTitle } from "./domain/navigation.js";
import {
  getImageWorkspaceHeader,
  getWorkspaceClassName,
  togglePanelState,
  type WorkspacePanelState
} from "./domain/workspaceLayout.js";
import { useSidebarResize } from "./hooks/useSidebarResize.js";

const EMPTY_RESULT: ImageSearchResult = {
  items: [],
  total: 0,
  facets: {
    sessions: [],
    last30Days: 0,
    last7Days: 0,
    today: 0,
    totalImages: 0,
    withPrompt: 0,
    withoutPrompt: 0
  }
};

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

export function App() {
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [promptState, setPromptState] = useState<PromptState>("all");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [result, setResult] = useState<ImageSearchResult>(EMPTY_RESULT);
  const [galleryMetaVisible, setGalleryMetaVisible] = useState(true);
  const [galleryViewMode, setGalleryViewMode] = useState<"grid" | "list">("grid");
  const [activeModule, setActiveModule] = useState<AppModule>("gallery");
  const [capabilitySection, setCapabilitySection] = useState<CapabilitySection>("overview");
  const [capabilities, setCapabilities] = useState<CapabilityScanResult | null>(null);
  const [capabilityQuery, setCapabilityQuery] = useState("");
  const [capabilityLoading, setCapabilityLoading] = useState(false);
  const [capabilityRefreshing, setCapabilityRefreshing] = useState(false);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [selectedCapabilityId, setSelectedCapabilityId] = useState<string | null>(null);
  const [leftPanelState, setLeftPanelState] = useState<WorkspacePanelState>("expanded");
  const [leftPanelWidth, setLeftPanelWidth] = useState(SIDEBAR_WIDTH_CONFIG.defaultWidth);
  const [rightPanelState, setRightPanelState] = useState<WorkspacePanelState>("expanded");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageContext, setImageContext] = useState<ImageContextResult | null>(null);
  const [imageContextLoading, setImageContextLoading] = useState(false);
  const [imageContextError, setImageContextError] = useState<string | null>(null);
  const [imageContextCacheEpoch, setImageContextCacheEpoch] = useState(0);
  const [promptInference, setPromptInference] = useState<ImagePromptInferenceRecord | null>(null);
  const [promptInferenceLoading, setPromptInferenceLoading] = useState(false);
  const [promptInferenceError, setPromptInferenceError] = useState<string | null>(null);
  const [promptInferenceSubmitting, setPromptInferenceSubmitting] = useState(false);
  const [promptTasks, setPromptTasks] = useState<PromptInferenceTasksResponse>(EMPTY_PROMPT_TASKS);
  const [promptTasksError, setPromptTasksError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextImageOffset, setNextImageOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageQueryKey = useMemo(
    () => JSON.stringify({ datePreset, promptState, query: debouncedQuery, sessionId }),
    [datePreset, debouncedQuery, promptState, sessionId]
  );
  const imageQueryKeyRef = useRef(imageQueryKey);
  const imageContextCacheRef = useRef(new Map<string, ImageContextResult>());
  const promptInferenceCacheRef = useRef(new Map<string, ImagePromptInferenceRecord | null>());
  const selectedIdRef = useRef<string | null>(selectedId);

  useEffect(() => {
    imageQueryKeyRef.current = imageQueryKey;
  }, [imageQueryKey]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const commitPromptTasks = useCallback((nextTasks: PromptInferenceTasksResponse): void => {
    setPromptTasks(nextTasks);
    setPromptTasksError(null);

    for (const task of nextTasks.tasks) {
      if (task.inference) {
        promptInferenceCacheRef.current.set(task.imageId, task.inference);
      }
    }

    const currentTask = getPromptTaskForImage(nextTasks.tasks, selectedIdRef.current);
    if (currentTask?.inference) {
      setPromptInference(currentTask.inference);
      setPromptInferenceError(currentTask.status === "failed" ? currentTask.error : null);
    }
  }, []);

  const refreshPromptTasks = useCallback(async (signal?: AbortSignal): Promise<void> => {
    const nextTasks = await fetchPromptInferenceTasks(signal);
    commitPromptTasks(nextTasks);
  }, [commitPromptTasks]);

  useEffect(() => {
    let cancelled = false;

    async function readStatus(): Promise<void> {
      try {
        const nextStatus = await fetchRuntimeStatus();
        if (cancelled) {
          return;
        }

        setRuntimeStatus(nextStatus);
        setStatusError(nextStatus.indexing.error);
      } catch (nextError) {
        if (!cancelled) {
          setStatusError(nextError instanceof Error ? nextError.message : "Unable to read local runtime status.");
        }
      }
    }

    void readStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!runtimeStatus || !shouldPollStatus(runtimeStatus)) {
      return;
    }

    const timer = window.setTimeout(() => {
      fetchRuntimeStatus()
        .then((nextStatus) => {
          setRuntimeStatus(nextStatus);
          setStatusError(nextStatus.indexing.error);
        })
        .catch((nextError) => {
          setStatusError(nextError instanceof Error ? nextError.message : "Unable to read local runtime status.");
        });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [runtimeStatus]);

  useEffect(() => {
    if (activeModule !== "capabilities" || capabilities) {
      return;
    }

    const controller = new AbortController();
    setCapabilityLoading(true);
    setCapabilityError(null);
    fetchCapabilities(controller.signal)
      .then((nextCapabilities) => {
        setCapabilities(nextCapabilities);
        setSelectedCapabilityId((current) => current ?? nextCapabilities.items[0]?.id ?? null);
      })
      .catch((nextError) => {
        if (nextError.name !== "AbortError") {
          setCapabilityError(nextError instanceof Error ? nextError.message : "Unable to scan Codex capabilities.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCapabilityLoading(false);
        }
      });

    return () => controller.abort();
  }, [activeModule, capabilities]);

  useEffect(() => {
    if (activeModule !== "gallery") {
      return;
    }

    const controller = new AbortController();
    refreshPromptTasks(controller.signal).catch((nextError) => {
      if (nextError.name !== "AbortError") {
        setPromptTasksError(nextError instanceof Error ? nextError.message : "Unable to load Codex prompt tasks.");
      }
    });
    return () => controller.abort();
  }, [activeModule, refreshPromptTasks]);

  useEffect(() => {
    if (activeModule !== "gallery" || !shouldPollPromptTasks(promptTasks)) {
      return;
    }

    const timer = window.setTimeout(() => {
      refreshPromptTasks().catch((nextError) => {
        setPromptTasksError(nextError instanceof Error ? nextError.message : "Unable to load Codex prompt tasks.");
      });
    }, promptTasks.summary.active > 0 ? 1_000 : 5_000);

    return () => window.clearTimeout(timer);
  }, [activeModule, promptTasks, refreshPromptTasks]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), 180);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!isLibraryReady(runtimeStatus)) {
      setLoading(runtimeStatus?.indexing.state === "indexing");
      setLoadingMore(false);
      setResult(EMPTY_RESULT);
      setSelectedId(null);
      setNextImageOffset(0);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setNextImageOffset(0);

    fetchImages(
      {
        query: debouncedQuery,
        datePreset,
        promptState,
        sessionId,
        limit: IMAGE_PAGE_SIZE,
        offset: 0
      },
      controller.signal
    )
      .then((nextResult) => {
        setResult(nextResult);
        setNextImageOffset(nextResult.items.length);
        setSelectedId((current) => {
          if (current && nextResult.items.some((image) => image.id === current)) {
            return current;
          }
          return nextResult.items[0]?.id ?? null;
        });
      })
      .catch((nextError) => {
        if (nextError.name !== "AbortError") {
          setError(nextError.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [debouncedQuery, datePreset, promptState, runtimeStatus, sessionId]);

  const selectedImage = useMemo(
    () => result.items.find((image) => image.id === selectedId) ?? null,
    [result.items, selectedId]
  );

  useEffect(() => {
    if (activeModule !== "gallery" || !selectedImage) {
      setImageContext(null);
      setImageContextLoading(false);
      setImageContextError(null);
      return;
    }

    const cachedContext = imageContextCacheRef.current.get(selectedImage.id);
    if (cachedContext) {
      setImageContext(cachedContext);
      setImageContextLoading(false);
      setImageContextError(null);
      return;
    }

    const controller = new AbortController();
    setImageContext(null);
    setImageContextLoading(true);
    setImageContextError(null);

    fetchImageContext(selectedImage.id, controller.signal)
      .then((nextContext) => {
        imageContextCacheRef.current.set(selectedImage.id, nextContext);
        setImageContext(nextContext);
      })
      .catch((nextError) => {
        if (nextError.name !== "AbortError") {
          setImageContextError(nextError instanceof Error ? nextError.message : "Unable to load image context.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setImageContextLoading(false);
        }
      });

    return () => controller.abort();
  }, [activeModule, imageContextCacheEpoch, selectedImage?.id]);

  useEffect(() => {
    if (activeModule !== "gallery" || !selectedImage || selectedImage.hasPrompt) {
      setPromptInference(null);
      setPromptInferenceLoading(false);
      setPromptInferenceError(null);
      return;
    }

    if (promptInferenceCacheRef.current.has(selectedImage.id)) {
      const cachedInference = promptInferenceCacheRef.current.get(selectedImage.id) ?? null;
      setPromptInference(cachedInference);
      setPromptInferenceLoading(false);
      setPromptInferenceError(cachedInference?.status === "failed" ? cachedInference.error : null);
      return;
    }

    const controller = new AbortController();
    setPromptInference(null);
    setPromptInferenceLoading(true);
    setPromptInferenceError(null);

    fetchImagePromptInference(selectedImage.id, controller.signal)
      .then((response) => {
        promptInferenceCacheRef.current.set(selectedImage.id, response.inference);
        setPromptInference(response.inference);
        setPromptInferenceError(response.inference?.status === "failed" ? response.inference.error : null);
      })
      .catch((nextError) => {
        if (nextError.name !== "AbortError") {
          setPromptInferenceError(nextError instanceof Error ? nextError.message : "Unable to load inferred prompt.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPromptInferenceLoading(false);
        }
      });

    return () => controller.abort();
  }, [activeModule, selectedImage?.id, selectedImage?.hasPrompt]);

  const selectedPromptTask = useMemo(
    () => getPromptTaskForImage(promptTasks.tasks, selectedImage?.id ?? null),
    [promptTasks.tasks, selectedImage?.id]
  );

  useEffect(() => {
    if (!selectedId || result.items.some((image) => image.id === selectedId)) {
      return;
    }
    setSelectedId(result.items[0]?.id ?? null);
  }, [result.items, selectedId]);
  const handleCopySelectedImage = useCallback(async (): Promise<void> => {
    if (!selectedImage) {
      return;
    }

    try {
      await copyImageBinaryToClipboard(
        selectedImage,
        getImageClipboardRuntime((image) => copyImageToNativeClipboard(image.id))
      );
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Copy image failed.");
    }
  }, [selectedImage]);

  useEffect(() => {
    if (activeModule !== "gallery" || !selectedImage) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!shouldHandleImageCopyShortcut(event)) {
        return;
      }
      if (window.getSelection()?.toString()) {
        return;
      }

      event.preventDefault();
      void handleCopySelectedImage();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeModule, handleCopySelectedImage, selectedImage]);

  const workspaceHeader = useMemo(
    () =>
      getImageWorkspaceHeader({
        datePreset,
        imageTotal: result.total,
        loading,
        promptState,
        query,
        selectedImage,
        sessionId
      }),
    [datePreset, loading, promptState, query, result.total, selectedImage, sessionId]
  );
  const visibleCapabilities = useMemo(
    () => filterCapabilities(capabilities, capabilitySection, capabilityQuery),
    [capabilities, capabilityQuery, capabilitySection]
  );
  const selectedCapability = useMemo(
    () => getSelectedCapability(visibleCapabilities, selectedCapabilityId),
    [selectedCapabilityId, visibleCapabilities]
  );
  useEffect(() => {
    if (activeModule !== "capabilities") {
      return;
    }

    if (!selectedCapability) {
      setSelectedCapabilityId(null);
      return;
    }

    if (selectedCapability.id !== selectedCapabilityId) {
      setSelectedCapabilityId(selectedCapability.id);
    }
  }, [activeModule, selectedCapability, selectedCapabilityId]);
  const sidebarResize = useSidebarResize({
    panelState: leftPanelState,
    width: leftPanelWidth,
    onPanelStateChange: setLeftPanelState,
    onWidthChange: setLeftPanelWidth
  });
  const workspaceClassName = [
    getWorkspaceClassName({ left: leftPanelState, right: rightPanelState }),
    sidebarResize.isResizing ? "left-resizing" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const workspaceStyle = {
    "--left-panel-width": getSidebarWidthCssValue(leftPanelWidth),
    "--left-panel-rail-width": `${SIDEBAR_WIDTH_CONFIG.collapsedWidth}px`
  } as CSSProperties;

  async function handleRefresh(): Promise<void> {
    setRefreshing(true);
    setError(null);
    setLoadingMore(false);
    imageContextCacheRef.current.clear();
    promptInferenceCacheRef.current.clear();
    setPromptTasks(EMPTY_PROMPT_TASKS);
    setImageContextCacheEpoch((current) => current + 1);
    try {
      await reindexLibrary();
      const nextStatus = await fetchRuntimeStatus();
      setRuntimeStatus(nextStatus);
      const nextResult = await fetchImages({
        query: debouncedQuery,
        datePreset,
        promptState,
        sessionId,
        limit: IMAGE_PAGE_SIZE,
        offset: 0
      });
      setResult(nextResult);
      setNextImageOffset(nextResult.items.length);
      setSelectedId((current) => current ?? nextResult.items[0]?.id ?? null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  const canLoadMoreImages = canLoadNextImagePage({
    loading,
    loadingMore,
    nextOffset: nextImageOffset,
    total: result.total
  });

  const handleLoadMoreImages = useCallback(async (): Promise<void> => {
    if (
      !canLoadNextImagePage({
        loading,
        loadingMore,
        nextOffset: nextImageOffset,
        total: result.total
      })
    ) {
      return;
    }

    const requestKey = imageQueryKey;
    const requestOffset = nextImageOffset;
    setLoadingMore(true);
    setError(null);

    try {
      const nextResult = await fetchImages({
        query: debouncedQuery,
        datePreset,
        promptState,
        sessionId,
        limit: IMAGE_PAGE_SIZE,
        offset: requestOffset
      });

      if (imageQueryKeyRef.current !== requestKey) {
        return;
      }

      setResult((current) => ({
        ...nextResult,
        items: mergeImagePages(current.items, nextResult.items)
      }));
      setNextImageOffset((current) =>
        Math.max(current, nextResult.items.length === 0 ? nextResult.total : requestOffset + nextResult.items.length)
      );
    } catch (nextError) {
      if (imageQueryKeyRef.current === requestKey) {
        setError(nextError instanceof Error ? nextError.message : "Unable to load more images.");
      }
    } finally {
      if (imageQueryKeyRef.current === requestKey) {
        setLoadingMore(false);
      }
    }
  }, [datePreset, debouncedQuery, imageQueryKey, loading, loadingMore, nextImageOffset, promptState, result.total, sessionId]);

  async function handleCapabilityRescan(): Promise<void> {
    setCapabilityRefreshing(true);
    setCapabilityError(null);
    try {
      const nextCapabilities = await rescanCapabilities();
      setCapabilities(nextCapabilities);
      setSelectedCapabilityId((current) => {
        if (current && nextCapabilities.items.some((item) => item.id === current)) {
          return current;
        }
        return nextCapabilities.items[0]?.id ?? null;
      });
    } catch (nextError) {
      setCapabilityError(nextError instanceof Error ? nextError.message : "Capability scan failed.");
    } finally {
      setCapabilityRefreshing(false);
    }
  }

  async function handleStartupRetry(): Promise<void> {
    setStatusError(null);
    void reindexLibrary()
      .then(() => fetchRuntimeStatus())
      .then(setRuntimeStatus)
      .catch((nextError) => {
        setStatusError(nextError instanceof Error ? nextError.message : "Unable to retry local indexing.");
      });

    try {
      setRuntimeStatus(await fetchRuntimeStatus());
    } catch (nextError) {
      setStatusError(nextError instanceof Error ? nextError.message : "Unable to read local runtime status.");
    }
  }

  function selectImage(image: ImageRecord): void {
    setSelectedId(image.id);
  }

  async function handleInferSelectedPrompt(): Promise<void> {
    if (!selectedImage || selectedImage.hasPrompt) {
      return;
    }

    const imageId = selectedImage.id;
    setPromptInferenceSubmitting(true);
    setPromptInferenceError(null);

    try {
      await enqueueImagePromptInferenceTask(imageId, promptInference?.status === "ready");
      await refreshPromptTasks();
    } catch (nextError) {
      if (selectedIdRef.current === imageId) {
        setPromptInferenceError(nextError instanceof Error ? nextError.message : "Prompt inference failed.");
      }
    } finally {
      if (selectedIdRef.current === imageId) {
        setPromptInferenceSubmitting(false);
      }
    }
  }

  async function handleCancelPromptTask(taskId: string): Promise<void> {
    try {
      await cancelPromptInferenceTask(taskId);
      await refreshPromptTasks();
    } catch (nextError) {
      setPromptTasksError(nextError instanceof Error ? nextError.message : "Unable to cancel Codex prompt task.");
    }
  }

  async function handleRetryPromptTask(image: ImageRecord): Promise<void> {
    try {
      await enqueueImagePromptInferenceTask(image.id, true);
      await refreshPromptTasks();
      setSelectedId(image.id);
    } catch (nextError) {
      setPromptTasksError(nextError instanceof Error ? nextError.message : "Unable to retry Codex prompt task.");
    }
  }

  function handleViewPromptTaskImage(image: ImageRecord): void {
    setResult((current) => ensureImageInResult(current, image));
    setSelectedId(image.id);
    setRightPanelState("expanded");
  }

  function selectCapability(capability: CapabilityRecord): void {
    setSelectedCapabilityId(capability.id);
  }

  function handleCapabilityOpen(filePath: string, action: "openFile" | "revealFile"): void {
    openCapabilityPath(filePath, action).catch((nextError) => {
      setCapabilityError(nextError instanceof Error ? nextError.message : "Unable to open capability path.");
    });
  }

  const startupMode = getStartupMode(runtimeStatus, statusError);
  if (startupMode) {
    return (
      <>
        <WindowDragRegion />
        <StartupScreen mode={startupMode} status={runtimeStatus} error={statusError} onRetry={handleStartupRetry} />
      </>
    );
  }

  return (
    <div className="app-shell">
      <WindowDragRegion />
      {error ? <div className="error-strip">{error}</div> : null}

      <div className={workspaceClassName} style={workspaceStyle}>
        <GlobalRail
          activeModule={activeModule}
          onActiveModuleChange={setActiveModule}
        />
        <Sidebar
          activeModule={activeModule}
          capabilitySection={capabilitySection}
          capabilitySummary={capabilities?.summary ?? null}
          collapsed={leftPanelState === "collapsed"}
          datePreset={datePreset}
          imageFacets={result.facets}
          promptState={promptState}
          sessionId={sessionId}
          sessions={result.facets.sessions}
          onCapabilitySectionChange={setCapabilitySection}
          onDatePresetChange={setDatePreset}
          onPromptStateChange={setPromptState}
          onSessionChange={setSessionId}
        />
        <section className="main-workspace" aria-label={activeModule === "gallery" ? "Image workspace" : "Capability workspace"}>
          <SidebarResizeHandle
            {...sidebarResize.handleProps}
            isResizing={sidebarResize.isResizing}
            panelState={leftPanelState}
          />
          <WorkspaceBar
            leftPanelState={leftPanelState}
            metaVisible={galleryMetaVisible}
            metaToggleVisible={activeModule === "gallery"}
            viewMode={galleryViewMode}
            viewModeVisible={activeModule === "gallery"}
            refreshing={activeModule === "gallery" ? refreshing : capabilityRefreshing}
            refreshLabel={activeModule === "gallery" ? "Refresh library" : "Rescan capabilities"}
            rightPanelState={rightPanelState}
            searchVisible={activeModule === "gallery"}
            title={activeModule === "gallery" ? workspaceHeader.title : getModuleTitle(activeModule)}
            onMetaVisibleChange={activeModule === "gallery" ? setGalleryMetaVisible : undefined}
            onRefresh={activeModule === "gallery" ? handleRefresh : handleCapabilityRescan}
            onSearchOpen={() => activeModule === "gallery" && setSearchOpen(true)}
            onToggleLeftPanel={() => setLeftPanelState((current) => togglePanelState(current))}
            onToggleRightPanel={() => setRightPanelState((current) => togglePanelState(current))}
            onViewModeChange={setGalleryViewMode}
          />
          {activeModule === "gallery" ? (
            <GalleryPane
              canLoadMore={canLoadMoreImages}
              images={result.items}
              loading={loading}
              loadingMore={loadingMore}
              metaVisible={galleryMetaVisible}
              selectedId={selectedId}
              total={result.total}
              viewMode={galleryViewMode}
              onLoadMore={handleLoadMoreImages}
              onSelect={selectImage}
            />
          ) : (
            <CapabilityWorkspace
              capabilities={capabilities}
              error={capabilityError}
              loading={capabilityLoading}
              query={capabilityQuery}
              section={capabilitySection}
              selectedId={selectedCapability?.id ?? null}
              onQueryChange={setCapabilityQuery}
              onSelect={selectCapability}
            />
          )}
        </section>
        {activeModule === "gallery" ? (
          <DetailPanel
            collapsed={rightPanelState === "collapsed"}
            context={imageContext}
            contextError={imageContextError}
            contextLoading={imageContextLoading}
            image={selectedImage}
            onCopyImage={() => void handleCopySelectedImage()}
            onCancelPromptTask={(task) => void handleCancelPromptTask(task.id)}
            onInferPrompt={() => void handleInferSelectedPrompt()}
            onRetryPromptTask={(task) => void handleRetryPromptTask(task.image)}
            onViewPromptTaskImage={handleViewPromptTaskImage}
            promptInference={selectedPromptTask?.inference ?? promptInference}
            promptInferenceError={selectedPromptTask?.status === "failed" ? selectedPromptTask.error : promptInferenceError}
            promptInferenceLoading={promptInferenceLoading}
            promptInferenceSubmitting={promptInferenceSubmitting}
            promptTask={selectedPromptTask}
            promptTasks={promptTasks}
            promptTasksError={promptTasksError}
            onRefreshPromptTasks={() => void refreshPromptTasks()}
          />
        ) : (
          <CapabilityInspector
            collapsed={rightPanelState === "collapsed"}
            capability={selectedCapability}
            onOpenPath={handleCapabilityOpen}
          />
        )}
      </div>

      {activeModule === "gallery" ? (
        <SearchOverlay
          images={result.items}
          loading={loading}
          open={searchOpen}
          query={query}
          selectedId={selectedId}
          total={result.total}
          onOpenChange={setSearchOpen}
          onQueryChange={setQuery}
          onSelectImage={selectImage}
        />
      ) : null}
    </div>
  );
}

function WindowDragRegion() {
  return <div className="window-drag-region" aria-hidden="true" />;
}

function isLibraryReady(status: RuntimeStatus | null): boolean {
  return Boolean(status?.codexDesktop.available && status.indexing.state === "ready");
}

function shouldPollStatus(status: RuntimeStatus): boolean {
  return status.indexing.state === "idle" || status.indexing.state === "indexing";
}

function shouldPollPromptTasks(tasks: PromptInferenceTasksResponse): boolean {
  return tasks.summary.active > 0;
}

function getPromptTaskForImage(
  tasks: PromptInferenceTaskView[],
  imageId: string | null
): PromptInferenceTaskView | null {
  if (!imageId) {
    return null;
  }

  const imageTasks = tasks.filter((task) => task.imageId === imageId);
  return (
    imageTasks.find((task) => task.status === "running") ??
    imageTasks.find((task) => task.status === "queued") ??
    imageTasks.find((task) => task.status === "failed") ??
    imageTasks.find((task) => task.status === "ready") ??
    null
  );
}

function getStartupMode(status: RuntimeStatus | null, statusError: string | null): StartupScreenMode | null {
  if (statusError) {
    return "error";
  }

  if (!status) {
    return "starting";
  }

  if (!status.codexDesktop.available) {
    return "missingCodex";
  }

  if (status.indexing.state === "idle" || status.indexing.state === "indexing") {
    return "indexing";
  }

  if (status.indexing.state === "error") {
    return "error";
  }

  return null;
}

import { useEffect, useMemo, useState } from "react";

import type { DatePreset, ImageRecord, ImageSearchResult, PromptState, RuntimeStatus } from "../shared/types.js";
import { fetchImages, fetchRuntimeStatus, reindexLibrary } from "./api/client.js";
import { DetailPanel } from "./components/DetailPanel.js";
import { GalleryPane } from "./components/GalleryPane.js";
import { SearchOverlay } from "./components/SearchOverlay.js";
import { Sidebar } from "./components/Sidebar.js";
import { StartupScreen, type StartupScreenMode } from "./components/StartupScreen.js";
import { WorkspaceBar } from "./components/WorkspaceBar.js";
import {
  getImageWorkspaceHeader,
  getWorkspaceClassName,
  togglePanelState,
  type WorkspacePanelState
} from "./domain/workspaceLayout.js";

const EMPTY_RESULT: ImageSearchResult = {
  items: [],
  total: 0,
  facets: {
    sessions: [],
    totalImages: 0,
    withPrompt: 0,
    withoutPrompt: 0
  }
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
  const [leftPanelState, setLeftPanelState] = useState<WorkspacePanelState>("expanded");
  const [rightPanelState, setRightPanelState] = useState<WorkspacePanelState>("expanded");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const handle = window.setTimeout(() => setDebouncedQuery(query), 180);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!isLibraryReady(runtimeStatus)) {
      setLoading(runtimeStatus?.indexing.state === "indexing");
      setResult(EMPTY_RESULT);
      setSelectedId(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchImages(
      {
        query: debouncedQuery,
        datePreset,
        promptState,
        sessionId,
        limit: 120
      },
      controller.signal
    )
      .then((nextResult) => {
        setResult(nextResult);
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
  const workspaceClassName = getWorkspaceClassName({ left: leftPanelState, right: rightPanelState });

  async function handleRefresh(): Promise<void> {
    setRefreshing(true);
    setError(null);
    try {
      await reindexLibrary();
      const nextStatus = await fetchRuntimeStatus();
      setRuntimeStatus(nextStatus);
      const nextResult = await fetchImages({
        query: debouncedQuery,
        datePreset,
        promptState,
        sessionId,
        limit: 120
      });
      setResult(nextResult);
      setSelectedId((current) => current ?? nextResult.items[0]?.id ?? null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
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

  const startupMode = getStartupMode(runtimeStatus, statusError);
  if (startupMode) {
    return <StartupScreen mode={startupMode} status={runtimeStatus} error={statusError} onRetry={handleStartupRetry} />;
  }

  return (
    <div className="app-shell">
      {error ? <div className="error-strip">{error}</div> : null}

      <div className={workspaceClassName}>
        <Sidebar
          collapsed={leftPanelState === "collapsed"}
          datePreset={datePreset}
          imageTotal={result.total}
          loading={loading}
          promptState={promptState}
          sessionId={sessionId}
          sessions={result.facets.sessions}
          onDatePresetChange={setDatePreset}
          onPromptStateChange={setPromptState}
          onSessionChange={setSessionId}
        />
        <section className="main-workspace" aria-label="Image workspace">
          <WorkspaceBar
            leftPanelState={leftPanelState}
            metaVisible={galleryMetaVisible}
            refreshing={refreshing}
            rightPanelState={rightPanelState}
            title={workspaceHeader.title}
            onMetaVisibleChange={setGalleryMetaVisible}
            onRefresh={handleRefresh}
            onSearchOpen={() => setSearchOpen(true)}
            onToggleLeftPanel={() => setLeftPanelState((current) => togglePanelState(current))}
            onToggleRightPanel={() => setRightPanelState((current) => togglePanelState(current))}
          />
          <GalleryPane
            images={result.items}
            loading={loading}
            metaVisible={galleryMetaVisible}
            selectedId={selectedId}
            onSelect={selectImage}
          />
        </section>
        <DetailPanel collapsed={rightPanelState === "collapsed"} image={selectedImage} />
      </div>

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
    </div>
  );
}

function isLibraryReady(status: RuntimeStatus | null): boolean {
  return Boolean(status?.codexDesktop.available && status.indexing.state === "ready");
}

function shouldPollStatus(status: RuntimeStatus): boolean {
  return status.indexing.state === "idle" || status.indexing.state === "indexing";
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

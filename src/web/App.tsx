import { useEffect, useMemo, useState } from "react";

import type { DatePreset, ImageRecord, ImageSearchResult, PromptState } from "../shared/types.js";
import { fetchImages, reindexLibrary } from "./api/client.js";
import { DetailPanel } from "./components/DetailPanel.js";
import { Gallery } from "./components/Gallery.js";
import { SearchOverlay } from "./components/SearchOverlay.js";
import { Sidebar } from "./components/Sidebar.js";

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
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [promptState, setPromptState] = useState<PromptState>("all");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [result, setResult] = useState<ImageSearchResult>(EMPTY_RESULT);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), 180);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
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
  }, [debouncedQuery, datePreset, promptState, sessionId]);

  const selectedImage = useMemo(
    () => result.items.find((image) => image.id === selectedId) ?? null,
    [result.items, selectedId]
  );

  async function handleRefresh(): Promise<void> {
    setRefreshing(true);
    setError(null);
    try {
      await reindexLibrary();
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

  function selectImage(image: ImageRecord): void {
    setSelectedId(image.id);
  }

  return (
    <div className="app-shell">
      {error ? <div className="error-strip">{error}</div> : null}

      <div className="workspace">
        <Sidebar
          datePreset={datePreset}
          imageTotal={result.total}
          loading={loading}
          promptState={promptState}
          query={query}
          refreshing={refreshing}
          sessionId={sessionId}
          sessions={result.facets.sessions}
          onDatePresetChange={setDatePreset}
          onPromptStateChange={setPromptState}
          onRefresh={handleRefresh}
          onSearchOpen={() => setSearchOpen(true)}
          onSessionChange={setSessionId}
        />
        <Gallery images={result.items} selectedId={selectedId} loading={loading} onSelect={selectImage} />
        <DetailPanel image={selectedImage} />
      </div>

      <SearchOverlay open={searchOpen} query={query} onOpenChange={setSearchOpen} onQueryChange={setQuery} />
    </div>
  );
}

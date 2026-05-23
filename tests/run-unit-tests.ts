import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LibraryService } from "../src/server/application/libraryService.js";
import { startCoMateRuntime } from "../src/server/application/serverRuntime.js";
import { detectCodexDesktopData } from "../src/server/infrastructure/codexDesktopDetector.js";
import { CodexImageScanner } from "../src/server/infrastructure/codexImageScanner.js";
import { CodexSessionRepository } from "../src/server/infrastructure/codexSessionRepository.js";
import { SqliteImageIndex } from "../src/server/infrastructure/sqliteImageIndex.js";
import { findAvailablePort } from "../src/desktop/utils/port.js";
import { waitForHttp } from "../src/desktop/utils/waitForHttp.js";
import { DetailPanel } from "../src/web/components/DetailPanel.js";
import { GalleryPane } from "../src/web/components/GalleryPane.js";
import { SearchOverlay } from "../src/web/components/SearchOverlay.js";
import { Sidebar } from "../src/web/components/Sidebar.js";
import { StartupScreen } from "../src/web/components/StartupScreen.js";
import { WorkspaceBar } from "../src/web/components/WorkspaceBar.js";
import {
  getImageWorkspaceHeader,
  getWorkspaceClassName,
  togglePanelState
} from "../src/web/domain/workspaceLayout.js";

const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "comate-test-"));

  try {
    await testCodexDesktopDetection(root);
    console.log("ok codex-desktop/detection");
    await testScannerSessionMergeAndIndex(root);
    console.log("ok scanner/session/index");
    testSearchUiRendering();
    console.log("ok web/search-ui");
    testWorkspaceLayoutModel();
    console.log("ok web/workspace-layout");
    testWorkspaceBarRendering();
    console.log("ok web/workspace-bar");
    testStartupScreenRendering();
    console.log("ok web/startup-screen");
    testGalleryViewRendering();
    console.log("ok web/gallery-view");
    await testEmbeddedRuntime(root);
    console.log("ok desktop/runtime");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function testCodexDesktopDetection(root: string): Promise<void> {
  const missingRoot = path.join(root, ".missing-codex");
  const missingStatus = await detectCodexDesktopData({
    codexRoot: missingRoot,
    generatedImagesDir: path.join(missingRoot, "generated_images"),
    sessionIndexPath: path.join(missingRoot, "session_index.jsonl"),
    sessionsDir: path.join(missingRoot, "sessions"),
    databasePath: path.join(root, "missing.sqlite")
  });

  assert.equal(missingStatus.available, false);
  assert.deepEqual(missingStatus.existingPaths, []);
  assert.ok(missingStatus.missingPaths.includes("codexRoot"));

  const codexRoot = path.join(root, ".codex-desktop-detection");
  await fs.mkdir(path.join(codexRoot, "sessions"), { recursive: true });
  const detectedStatus = await detectCodexDesktopData({
    codexRoot,
    generatedImagesDir: path.join(codexRoot, "generated_images"),
    sessionIndexPath: path.join(codexRoot, "session_index.jsonl"),
    sessionsDir: path.join(codexRoot, "sessions"),
    databasePath: path.join(root, "detected.sqlite")
  });

  assert.equal(detectedStatus.available, true);
  assert.deepEqual(detectedStatus.existingPaths.sort(), ["codexRoot", "sessionsDir"].sort());
  assert.ok(detectedStatus.missingPaths.includes("generatedImagesDir"));
}

function testStartupScreenRendering(): void {
  const noop = () => undefined;
  const markup = renderToStaticMarkup(
    createElement(StartupScreen, {
      mode: "missingCodex",
      status: {
        codexDesktop: {
          available: false,
          codexRoot: "/tmp/.codex",
          generatedImagesDir: "/tmp/.codex/generated_images",
          sessionIndexPath: "/tmp/.codex/session_index.jsonl",
          sessionsDir: "/tmp/.codex/sessions",
          existingPaths: [],
          missingPaths: ["codexRoot", "generatedImagesDir", "sessionIndexPath", "sessionsDir"]
        },
        indexing: {
          state: "ready",
          indexed: 0,
          scannedAt: new Date().toISOString(),
          durationMs: 0,
          error: null
        },
        localOnly: true,
        targetApp: "Codex Desktop"
      },
      error: null,
      onRetry: noop
    })
  );

  assert.match(markup, /Codex Desktop data was not found/);
  assert.match(markup, /Codex desktop app/);
  assert.match(markup, /Completely local/);
  assert.match(markup, />Retry</);
}

async function testScannerSessionMergeAndIndex(root: string): Promise<void> {
  const sessionId = "019e4a58-2295-78d2-ae37-3a8c0f2fa4dc";
  const callId = "ig_0655d470aaa57ebb016a0f1ccc96908193baaa50abf59d2469";
  const codexRoot = path.join(root, ".codex");
  const generatedDir = path.join(codexRoot, "generated_images");
  const imageDir = path.join(generatedDir, sessionId);
  const sessionsDir = path.join(codexRoot, "sessions");
  const sessionLogDir = path.join(sessionsDir, "2026", "05", "21");
  const imagePath = path.join(imageDir, `${callId}.png`);
  const sessionLogPath = path.join(sessionLogDir, `rollout-2026-05-21T19-42-30-${sessionId}.jsonl`);
  const indexPath = path.join(codexRoot, "session_index.jsonl");
  const dbPath = path.join(root, "index.sqlite");

  await fs.mkdir(imageDir, { recursive: true });
  await fs.mkdir(sessionLogDir, { recursive: true });
  await fs.writeFile(imagePath, Buffer.from(PNG_1X1, "base64"));
  await fs.writeFile(
    indexPath,
    [
      JSON.stringify({ id: sessionId, thread_name: "旧标题", updated_at: "2026-05-20T00:00:00.000Z" }),
      JSON.stringify({ id: sessionId, thread_name: "制作 Apple 3D 海报", updated_at: "2026-05-21T11:43:03.926Z" })
    ].join("\n")
  );
  await fs.writeFile(
    sessionLogPath,
    JSON.stringify({
      timestamp: "2026-05-21T11:46:07.558Z",
      payload: {
        type: "image_generation_end",
        call_id: callId,
        saved_path: imagePath,
        revised_prompt: "Create a clean Apple poster with glass detail."
      }
    }) + "\n"
  );

  const scanner = new CodexImageScanner(generatedDir);
  const scanned = await scanner.scan();
  assert.equal(scanned.length, 1);
  assert.equal(scanned[0]?.sessionId, sessionId);
  assert.equal(scanned[0]?.callId, callId);
  assert.equal(scanned[0]?.width, 1);
  assert.equal(scanned[0]?.height, 1);

  const sessions = new CodexSessionRepository(indexPath, sessionsDir);
  const sessionIndex = await sessions.readSessionIndex();
  assert.equal(sessionIndex.get(sessionId)?.threadName, "制作 Apple 3D 海报");

  const logMap = await sessions.readSessionLogMap();
  assert.equal(logMap.get(sessionId)?.filePath, sessionLogPath);

  const events = await sessions.readImageEvents(sessionLogPath);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.revisedPrompt, "Create a clean Apple poster with glass detail.");

  const index = await SqliteImageIndex.open(dbPath);
  try {
    const library = new LibraryService(scanner, sessions, index);
    const records = await library.buildImageRecords();
    assert.equal(records.length, 1);
    assert.equal(records[0]?.threadName, "制作 Apple 3D 海报");
    assert.equal(records[0]?.hasPrompt, true);

    index.replaceAll(records);
    assert.equal(index.count(), 1);

    const promptSearch = index.search({ query: "Apple", limit: 20 });
    assert.equal(promptSearch.total, 1);
    assert.equal(promptSearch.items[0]?.filePath, imagePath);

    const titleSearch = index.search({ query: "海报", limit: 20 });
    assert.equal(titleSearch.total, 1);

    const emptySearch = index.search({ query: "not-found", limit: 20 });
    assert.equal(emptySearch.total, 0);
  } finally {
    index.close();
  }
}

function testSearchUiRendering(): void {
  const noop = () => undefined;
  const image = {
    id: "image-a",
    filePath: "/tmp/image-a.png",
    fileName: "ig_image_a.png",
    sessionId: "session-a",
    threadName: "制作 Apple 3D 海报",
    generatedAt: "2026-05-21T11:46:07.558Z",
    fileModifiedAt: "2026-05-21T11:46:07.558Z",
    prompt: "Create a clean Apple poster with glass detail.",
    width: 1,
    height: 1,
    sizeBytes: 68,
    callId: "ig_image_a",
    sessionPath: "/tmp/session.jsonl",
    hasPrompt: true
  };
  const closedOverlay = renderToStaticMarkup(
    createElement(SearchOverlay, {
      images: [],
      loading: false,
      open: false,
      query: "",
      selectedId: null,
      total: 0,
      onOpenChange: noop,
      onQueryChange: noop,
      onSelectImage: noop
    })
  );
  assert.equal(closedOverlay, "");

  const openOverlay = renderToStaticMarkup(
    createElement(SearchOverlay, {
      images: [image],
      loading: false,
      open: true,
      query: "Apple",
      selectedId: image.id,
      total: 1,
      onOpenChange: noop,
      onQueryChange: noop,
      onSelectImage: noop
    })
  );
  assert.match(openOverlay, /class="search-overlay"/);
  assert.match(openOverlay, /aria-modal="true"/);
  assert.match(openOverlay, /value="Apple"/);
  assert.match(openOverlay, /class="search-result-item"/);
  assert.match(openOverlay, /制作 Apple 3D 海报/);
  assert.match(openOverlay, />title</);

  const sidebarMarkup = renderToStaticMarkup(
    createElement(Sidebar, {
      collapsed: false,
      datePreset: "all",
      imageTotal: 42,
      loading: false,
      promptState: "all",
      sessionId: undefined,
      sessions: [{ sessionId: "session-a", threadName: "Design notes", count: 3 }],
      onDatePresetChange: noop,
      onPromptStateChange: noop,
      onSessionChange: noop
    })
  );

  const withPromptIndex = sidebarMarkup.indexOf(">With prompt<");
  const sessionsIndex = sidebarMarkup.indexOf(">Sessions<");
  assert.ok(withPromptIndex >= 0);
  assert.ok(sessionsIndex > withPromptIndex);
  assert.match(sidebarMarkup, /class="session-section"/);
  assert.match(sidebarMarkup, /aria-expanded="true"/);
  assert.equal(sidebarMarkup.includes(">All sessions<"), false);
  assert.equal(sidebarMarkup.includes(">Search<"), false);
  assert.equal(sidebarMarkup.includes("search-entry"), false);
  assert.match(sidebarMarkup, /brand-mark/);
  assert.match(sidebarMarkup, /comate-icon\.svg/);
  assert.equal(sidebarMarkup.includes(">CM<"), false);
  assert.equal(sidebarMarkup.includes("Local"), false);
  assert.equal(sidebarMarkup.includes("Sync"), false);
  assert.equal(sidebarMarkup.includes("42 images"), false);
  assert.equal(sidebarMarkup.includes("floating-search"), false);
  assert.equal(sidebarMarkup.includes("Settings"), false);

  const collapsedSidebarMarkup = renderToStaticMarkup(
    createElement(Sidebar, {
      collapsed: true,
      datePreset: "all",
      imageTotal: 42,
      loading: false,
      promptState: "all",
      sessionId: undefined,
      sessions: [],
      onDatePresetChange: noop,
      onPromptStateChange: noop,
      onSessionChange: noop
    })
  );
  assert.match(collapsedSidebarMarkup, /rail-brand/);
  assert.match(collapsedSidebarMarkup, /alt="CoMate"/);
  assert.equal(collapsedSidebarMarkup.includes(">CM<"), false);

  const detailMarkup = renderToStaticMarkup(createElement(DetailPanel, { image }));
  const promptIndex = detailMarkup.indexOf(">Prompt<");
  const detailsIndex = detailMarkup.indexOf(">Details<");
  const titleIndex = detailMarkup.indexOf(">Title<");
  assert.ok(promptIndex >= 0);
  assert.ok(detailsIndex > promptIndex);
  assert.ok(titleIndex > detailsIndex);
  assert.match(detailMarkup, /class="detail-section prompt-section"/);
  assert.match(detailMarkup, /class="detail-section metadata-section"/);
  assert.match(detailMarkup, /aria-label="Copy prompt"/);
}

function testWorkspaceLayoutModel(): void {
  const image = {
    id: "image-a",
    filePath: "/tmp/image-a.png",
    fileName: "ig_image_a.png",
    sessionId: "session-a",
    threadName: "制作 Apple 3D 海报",
    generatedAt: "2026-05-21T11:46:07.558Z",
    fileModifiedAt: "2026-05-21T11:46:07.558Z",
    prompt: "Create a clean Apple poster with glass detail.",
    width: 1,
    height: 1,
    sizeBytes: 68,
    callId: "ig_image_a",
    sessionPath: "/tmp/session.jsonl",
    hasPrompt: true
  };

  assert.equal(togglePanelState("expanded"), "collapsed");
  assert.equal(togglePanelState("collapsed"), "expanded");
  assert.equal(getWorkspaceClassName({ left: "expanded", right: "collapsed" }), "workspace right-collapsed");
  assert.equal(getWorkspaceClassName({ left: "collapsed", right: "collapsed" }), "workspace left-collapsed right-collapsed");

  const selectedHeader = getImageWorkspaceHeader({
    datePreset: "week",
    imageTotal: 7,
    loading: false,
    promptState: "withPrompt",
    query: "Apple",
    selectedImage: image,
    sessionId: image.sessionId
  });
  assert.equal(selectedHeader.title, "图片浏览");
  assert.match(selectedHeader.context, /7 images/);
  assert.match(selectedHeader.context, /Last 7 days/);
  assert.match(selectedHeader.context, /with prompts/);
  assert.match(selectedHeader.context, /Search: Apple/);
  assert.match(selectedHeader.context, /session scoped/);

  const fallbackHeader = getImageWorkspaceHeader({
    datePreset: "all",
    imageTotal: 0,
    loading: true,
    promptState: "all",
    query: "",
    selectedImage: null,
    sessionId: undefined
  });
  assert.equal(fallbackHeader.title, "图片浏览");
  assert.match(fallbackHeader.context, /Loading/);
}

function testWorkspaceBarRendering(): void {
  const noop = () => undefined;
  const expandedMarkup = renderToStaticMarkup(
    createElement(WorkspaceBar, {
      leftPanelState: "expanded",
      metaVisible: true,
      refreshing: false,
      rightPanelState: "expanded",
      title: "Images",
      onMetaVisibleChange: noop,
      onRefresh: noop,
      onSearchOpen: noop,
      onToggleLeftPanel: noop,
      onToggleRightPanel: noop
    })
  );

  assert.match(expandedMarkup, /class="workspace-bar"/);
  assert.match(expandedMarkup, /Collapse sidebar/);
  assert.match(expandedMarkup, /Collapse inspector/);
  assert.match(expandedMarkup, /data-panel-side="left"/);
  assert.match(expandedMarkup, /data-panel-side="right"/);
  assert.match(expandedMarkup, /aria-expanded="true"/);
  assert.match(expandedMarkup, />Search</);
  assert.match(expandedMarkup, /Hide grid details/);
  assert.match(expandedMarkup, /workspace-detail-toggle/);
  assert.match(expandedMarkup, /aria-pressed="true"/);

  const collapsedMarkup = renderToStaticMarkup(
    createElement(WorkspaceBar, {
      leftPanelState: "collapsed",
      metaVisible: false,
      refreshing: true,
      rightPanelState: "collapsed",
      title: "Morning brief",
      onMetaVisibleChange: noop,
      onRefresh: noop,
      onSearchOpen: noop,
      onToggleLeftPanel: noop,
      onToggleRightPanel: noop
    })
  );

  assert.match(collapsedMarkup, /Expand sidebar/);
  assert.match(collapsedMarkup, /Expand inspector/);
  assert.match(collapsedMarkup, /aria-expanded="false"/);
  assert.match(collapsedMarkup, /Show grid details/);
  assert.match(collapsedMarkup, /workspace-detail-toggle/);
  assert.match(collapsedMarkup, /aria-pressed="false"/);
  assert.match(collapsedMarkup, /spin/);
}

function testGalleryViewRendering(): void {
  const noop = () => undefined;
  const image = {
    id: "image-a",
    filePath: "/tmp/image-a.png",
    fileName: "ig_image_a.png",
    sessionId: "session-a",
    threadName: "制作 Apple 3D 海报",
    generatedAt: "2026-05-21T11:46:07.558Z",
    fileModifiedAt: "2026-05-21T11:46:07.558Z",
    prompt: "Create a clean Apple poster with glass detail.",
    width: 1,
    height: 1,
    sizeBytes: 68,
    callId: "ig_image_a",
    sessionPath: "/tmp/session.jsonl",
    hasPrompt: true
  };

  const detailedMarkup = renderToStaticMarkup(
    createElement(GalleryPane, {
      images: [image],
      loading: false,
      metaVisible: true,
      selectedId: image.id,
      onSelect: noop
    })
  );
  assert.match(detailedMarkup, /class="tile-meta"/);

  const cleanMarkup = renderToStaticMarkup(
    createElement(GalleryPane, {
      images: [image],
      loading: false,
      metaVisible: false,
      selectedId: image.id,
      onSelect: noop
    })
  );
  assert.match(cleanMarkup, /gallery gallery-clean/);
  assert.equal(cleanMarkup.includes('class="tile-meta"'), false);
}

async function testEmbeddedRuntime(root: string): Promise<void> {
  const codexRoot = path.join(root, ".codex-empty");
  const appDataDir = path.join(root, ".comate-empty");
  const port = await findAvailablePort(48_880);
  const runtime = await startCoMateRuntime({
    codexPaths: {
      codexRoot,
      generatedImagesDir: path.join(codexRoot, "generated_images"),
      sessionIndexPath: path.join(codexRoot, "session_index.jsonl"),
      sessionsDir: path.join(codexRoot, "sessions"),
      databasePath: path.join(appDataDir, "comate.sqlite")
    },
    port,
    staticDir: null
  });

  try {
    await waitForHttp(`${runtime.url}/api/health`, { timeoutMs: 2_000, intervalMs: 50 });
    const initialIndex = await runtime.initialIndex;
    assert.equal(initialIndex.indexed, 0);

    const response = await fetch(`${runtime.url}/api/health`);
    const health = (await response.json()) as { indexed: number; indexingState: string; localOnly: boolean; targetApp: string };
    assert.equal(health.indexed, 0);
    assert.equal(health.indexingState, "ready");
    assert.equal(health.localOnly, true);
    assert.equal(health.targetApp, "Codex Desktop");

    const statusResponse = await fetch(`${runtime.url}/api/status`);
    const status = (await statusResponse.json()) as {
      codexDesktop: { available: boolean; missingPaths: string[] };
      indexing: { state: string; indexed: number };
      localOnly: boolean;
      targetApp: string;
    };
    assert.equal(status.codexDesktop.available, false);
    assert.ok(status.codexDesktop.missingPaths.includes("codexRoot"));
    assert.equal(status.indexing.state, "ready");
    assert.equal(status.indexing.indexed, 0);
    assert.equal(status.localOnly, true);
    assert.equal(status.targetApp, "Codex Desktop");
  } finally {
    await runtime.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

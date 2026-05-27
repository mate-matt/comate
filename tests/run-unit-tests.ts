import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  CapabilityRecord,
  CapabilityScanResult,
  ImageContextResult,
  ImageCopyResult,
  ImageRecord,
  ImageSearchResult
} from "../src/shared/types.js";
import { buildImageContext } from "../src/server/application/imageContextService.js";
import { LibraryService } from "../src/server/application/libraryService.js";
import { startCoMateRuntime } from "../src/server/application/serverRuntime.js";
import { normalizeStaticPath } from "../src/server/api/staticAssets.js";
import { detectCodexDesktopData } from "../src/server/infrastructure/codexDesktopDetector.js";
import { CodexCapabilityScanner } from "../src/server/infrastructure/codexCapabilityScanner.js";
import { CodexImageScanner } from "../src/server/infrastructure/codexImageScanner.js";
import { CodexSessionRepository } from "../src/server/infrastructure/codexSessionRepository.js";
import { getThumbnailCachePath } from "../src/server/infrastructure/imageThumbnailService.js";
import { SqliteImageIndex } from "../src/server/infrastructure/sqliteImageIndex.js";
import { getNavigationDecision } from "../src/desktop/domain/navigationPolicy.js";
import {
  formatMissingDesktopStaticAssetsMessage,
  getRequiredDesktopStaticAssets
} from "../src/desktop/domain/staticAssets.js";
import {
  DESKTOP_WINDOW_CONFIG,
  getDesktopWindowChromeOptions,
  getInitialWindowBounds,
  sanitizeWindowBounds,
  toPersistedWindowBounds
} from "../src/desktop/domain/windowState.js";
import { findAvailablePort } from "../src/desktop/utils/port.js";
import { waitForHttp } from "../src/desktop/utils/waitForHttp.js";
import { CapabilityInspector } from "../src/web/components/CapabilityInspector.js";
import { CapabilityWorkspace } from "../src/web/components/CapabilityWorkspace.js";
import { DetailPanel } from "../src/web/components/DetailPanel.js";
import { GalleryPane } from "../src/web/components/GalleryPane.js";
import { GlobalRail } from "../src/web/components/GlobalRail.js";
import { SearchOverlay } from "../src/web/components/SearchOverlay.js";
import { Sidebar } from "../src/web/components/Sidebar.js";
import { SidebarResizeHandle } from "../src/web/components/SidebarResizeHandle.js";
import { StartupScreen } from "../src/web/components/StartupScreen.js";
import { WorkspaceBar } from "../src/web/components/WorkspaceBar.js";
import {
  clampSidebarWidth,
  getSidebarDragResult,
  getSidebarWidthCssValue,
  SIDEBAR_WIDTH_CONFIG
} from "../src/web/domain/sidebarResize.js";
import { filterCapabilities, getCapabilityMenuCount, getSelectedCapability } from "../src/web/domain/capabilityView.js";
import { canLoadNextImagePage, mergeImagePages } from "../src/web/domain/imagePagination.js";
import {
  copyImageBinaryToClipboard,
  getClipboardImageMimeType,
  shouldHandleImageCopyShortcut
} from "../src/web/domain/imageClipboard.js";
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
    await testSessionTimelineAndContext(root);
    console.log("ok session/context-model");
    await testSqliteIncrementalIndex(root);
    console.log("ok sqlite/incremental-index");
    await testCapabilityScanner(root);
    console.log("ok scanner/capabilities");
    testSearchUiRendering();
    console.log("ok web/search-ui");
    testWorkspaceLayoutModel();
    console.log("ok web/workspace-layout");
    testCapabilityViewModel();
    console.log("ok web/capability-view");
    testImagePaginationModel();
    console.log("ok web/image-pagination");
    testSidebarResizeModel();
    console.log("ok web/sidebar-resize");
    testSidebarResizeHandleRendering();
    console.log("ok web/sidebar-resize-handle");
    testWorkspaceBarRendering();
    console.log("ok web/workspace-bar");
    await testImageClipboardModel();
    console.log("ok web/image-clipboard");
    testThumbnailCacheModel(root);
    console.log("ok server/thumbnail-cache");
    testDesktopDomainModels();
    console.log("ok desktop/domain");
    testStaticAssetPathModel();
    console.log("ok server/static-assets");
    await testDesktopChromeCss();
    console.log("ok web/desktop-chrome-css");
    await testCoMateIconAsset();
    console.log("ok assets/comate-icon");
    testStartupScreenRendering();
    console.log("ok web/startup-screen");
    testGalleryViewRendering();
    console.log("ok web/gallery-view");
    testCapabilityViewRendering();
    console.log("ok web/capability-ui");
    await testEmbeddedRuntime(root);
    console.log("ok desktop/runtime");
    await testDesktopNativeClipboardEndpoint(root);
    console.log("ok desktop/native-clipboard");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function testDesktopDomainModels(): void {
  const appUrl = "http://127.0.0.1:4388/";
  assert.deepEqual(getNavigationDecision("http://127.0.0.1:4388/api/health", appUrl), {
    disposition: "allow-app",
    reason: "same-origin-app",
    url: "http://127.0.0.1:4388/api/health"
  });
  assert.deepEqual(getNavigationDecision("https://example.com/docs", appUrl), {
    disposition: "open-external",
    reason: "external-safe-protocol",
    url: "https://example.com/docs"
  });
  assert.equal(getNavigationDecision("file:///tmp/private.txt", appUrl).disposition, "deny");
  assert.equal(getNavigationDecision("javascript:alert(1)", appUrl).disposition, "deny");
  assert.equal(getNavigationDecision("not a url", appUrl).reason, "invalid-url");

  const requiredAssets = getRequiredDesktopStaticAssets("/tmp/comate/dist-web");
  assert.deepEqual(requiredAssets, [
    {
      absolutePath: "/tmp/comate/dist-web/index.html",
      relativePath: "index.html"
    }
  ]);
  assert.match(
    formatMissingDesktopStaticAssetsMessage("/tmp/comate/dist-web", ["index.html"]),
    /npm run build/
  );

  assert.equal(sanitizeWindowBounds(null), null);
  assert.equal(sanitizeWindowBounds({ width: "wide", height: 900 }), null);
  assert.deepEqual(sanitizeWindowBounds({ width: 500, height: 500, x: 12.4, y: 20.8 }), {
    height: DESKTOP_WINDOW_CONFIG.minHeight,
    width: DESKTOP_WINDOW_CONFIG.minWidth,
    x: 12,
    y: 21
  });
  assert.deepEqual(sanitizeWindowBounds({ width: 3600, height: 2600 }), {
    height: DESKTOP_WINDOW_CONFIG.maxHeight,
    width: DESKTOP_WINDOW_CONFIG.maxWidth
  });
  assert.deepEqual(getInitialWindowBounds(null), {
    height: DESKTOP_WINDOW_CONFIG.defaultHeight,
    width: DESKTOP_WINDOW_CONFIG.defaultWidth
  });
  assert.equal(DESKTOP_WINDOW_CONFIG.backgroundColor, "#f6fbfe");
  assert.deepEqual(getDesktopWindowChromeOptions("darwin"), {
    titleBarStyle: "hiddenInset",
    trafficLightPosition: {
      x: 18,
      y: 14
    }
  });
  assert.deepEqual(getDesktopWindowChromeOptions("linux"), {});
  assert.deepEqual(toPersistedWindowBounds({ width: 1180, height: 820, x: 44, y: 36 }), {
    height: 820,
    width: 1180,
    x: 44,
    y: 36
  });
}

function testStaticAssetPathModel(): void {
  const staticDir = path.join("/", "tmp", "comate", "dist-web");
  assert.equal(normalizeStaticPath(staticDir, "/"), path.join(staticDir, "index.html"));
  assert.equal(normalizeStaticPath(staticDir, "/assets/app.js"), path.join(staticDir, "assets", "app.js"));
  assert.equal(normalizeStaticPath(staticDir, "/%"), null);
  assert.equal(normalizeStaticPath(staticDir, "/../secret.txt"), null);
  assert.equal(normalizeStaticPath(staticDir, "/..%2Fsecret.txt"), null);
}

async function testDesktopChromeCss(): Promise<void> {
  const css = await fs.readFile(path.join(process.cwd(), "src", "web", "styles.css"), "utf8");
  assert.match(css, /--window-drag-height:\s*34px/);
  assert.match(css, /--rail-control-safe-top:\s*72px/);
  assert.match(css, /--rail-content-offset-x:\s*7px/);
  assert.match(css, /\.window-drag-region\s*{[\s\S]*-webkit-app-region:\s*drag/);
  assert.match(css, /\.global-rail\s*{[\s\S]*height:\s*100vh;[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
  assert.match(css, /\.global-rail-nav\s*{[\s\S]*transform:\s*translateX\(var\(--rail-content-offset-x\)\)/);
  assert.match(css, /\.global-rail-button\.active\s*{[\s\S]*border-color:\s*rgba\(63,\s*130,\s*247,\s*0\.42\)/);
  assert.match(css, /\.global-rail-button\.active::after\s*{[\s\S]*background:\s*#3f82f7/);
  assert.match(css, /\.sidebar\s*{[\s\S]*margin-top:\s*var\(--window-drag-height\)/);
  assert.match(css, /\.main-workspace\s*{[\s\S]*margin-top:\s*var\(--window-drag-height\)/);
  assert.match(css, /\.detail-panel\s*{[\s\S]*margin-top:\s*var\(--window-drag-height\)/);
}

async function testCoMateIconAsset(): Promise<void> {
  const svg = await fs.readFile(path.join(process.cwd(), "assets", "comate-icon.svg"), "utf8");
  assert.match(svg, /id="glass"/);
  assert.match(svg, /id="accent"/);
  assert.match(svg, /fill="#ffffff" fill-opacity="0\.5"/);
  assert.match(svg, /font-size="278"/);
  assert.match(svg, />CM<\/text>/);
}

async function testCodexDesktopDetection(root: string): Promise<void> {
  const missingRoot = path.join(root, ".missing-codex");
  const missingStatus = await detectCodexDesktopData({
    codexRoot: missingRoot,
    generatedImagesDir: path.join(missingRoot, "generated_images"),
    sessionIndexPath: path.join(missingRoot, "session_index.jsonl"),
    sessionsDir: path.join(missingRoot, "sessions"),
    databasePath: path.join(root, "missing.sqlite"),
    thumbnailCacheDir: path.join(root, "missing-thumbnails")
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
    databasePath: path.join(root, "detected.sqlite"),
    thumbnailCacheDir: path.join(root, "detected-thumbnails")
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
          error: null,
          progress: { phase: "ready", processed: 0, total: 0 }
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

  const indexingMarkup = renderToStaticMarkup(
    createElement(StartupScreen, {
      mode: "indexing",
      status: {
        codexDesktop: {
          available: true,
          codexRoot: "/tmp/.codex",
          generatedImagesDir: "/tmp/.codex/generated_images",
          sessionIndexPath: "/tmp/.codex/session_index.jsonl",
          sessionsDir: "/tmp/.codex/sessions",
          existingPaths: ["codexRoot", "generatedImagesDir", "sessionIndexPath", "sessionsDir"],
          missingPaths: []
        },
        indexing: {
          state: "indexing",
          indexed: 0,
          scannedAt: null,
          durationMs: null,
          error: null,
          progress: { phase: "scanning", processed: 3, total: 10 }
        },
        localOnly: true,
        targetApp: "Codex Desktop"
      },
      error: null,
      onRetry: noop
    })
  );
  assert.match(indexingMarkup, /role="progressbar"/);
  assert.match(indexingMarkup, /aria-valuenow="30"/);
  assert.match(indexingMarkup, /Scanning 3 of 10 images/);
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
    [
      createMessageLine("2026-05-21T11:45:40.000Z", "user", "Make an Apple product poster."),
      JSON.stringify({
        timestamp: "2026-05-21T11:46:07.558Z",
        payload: {
          type: "image_generation_end",
          call_id: callId,
          saved_path: imagePath,
          revised_prompt: "Create a clean Apple poster with glass detail."
        }
      }),
      createMessageLine("2026-05-21T11:46:30.000Z", "assistant", "The poster image is ready.")
    ].join("\n")
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

    const progressEvents: Array<{ phase: string; processed: number; total: number }> = [];
    const rebuildResult = await library.rebuildIndex((progress) => {
      progressEvents.push(progress);
    });
    assert.equal(rebuildResult.indexed, 1);
    assert.equal(index.count(), 1);
    assert.ok(progressEvents.some((progress) => progress.phase === "scanning" && progress.total === 1));
    assert.ok(progressEvents.some((progress) => progress.phase === "linking" && progress.processed === 1));
    assert.ok(progressEvents.some((progress) => progress.phase === "writing" && progress.processed === 1));
    const indexedContext = index.getImageContext(records[0]!.id);
    assert.equal(indexedContext?.status, "available");
    assert.deepEqual(indexedContext?.messages.map((message) => message.text), [
      "Make an Apple product poster.",
      "The poster image is ready."
    ]);
  } finally {
    index.close();
  }
}

async function testSessionTimelineAndContext(root: string): Promise<void> {
  const sessionId = "019e4a58-2295-78d2-ae37-3a8c0f2fa4dc";
  const sessionsDir = path.join(root, ".codex-context", "sessions");
  const sessionLogPath = path.join(sessionsDir, `${sessionId}.jsonl`);
  const imagePath = path.join(root, ".codex-context", "generated_images", sessionId, "ig_context.png");
  await fs.mkdir(path.dirname(sessionLogPath), { recursive: true });
  await fs.mkdir(path.dirname(imagePath), { recursive: true });

  await fs.writeFile(
    sessionLogPath,
    [
      createMessageLine("2026-05-21T11:45:00.000Z", "user", "Make the poster calmer."),
      JSON.stringify({
        timestamp: "2026-05-21T11:45:10.000Z",
        payload: {
          type: "response_item",
          item: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Use quieter glass and more spacing." }]
          }
        }
      }),
      createMessageLine("2026-05-21T11:45:20.000Z", "user", "Keep the product visible."),
      JSON.stringify({
        timestamp: "2026-05-21T11:46:00.000Z",
        payload: {
          type: "image_generation_end",
          call_id: "ig_context",
          saved_path: imagePath,
          revised_prompt: "A calm glass product poster."
        }
      }),
      createMessageLine("2026-05-21T11:46:20.000Z", "assistant", "The first image is ready."),
      createMessageLine("2026-05-21T11:47:00.000Z", "user", "Make it a bit brighter.")
    ].join("\n")
  );

  const sessions = new CodexSessionRepository(path.join(root, "missing-index.jsonl"), sessionsDir);
  const timeline = await sessions.readSessionTimeline(sessionLogPath);
  assert.equal(timeline.length, 6);
  assert.deepEqual(
    timeline.filter((event) => event.kind === "message").map((event) => event.kind === "message" && [event.role, event.text]),
    [
      ["user", "Make the poster calmer."],
      ["assistant", "Use quieter glass and more spacing."],
      ["user", "Keep the product visible."],
      ["assistant", "The first image is ready."],
      ["user", "Make it a bit brighter."]
    ]
  );

  const context = buildImageContext(
    createImageRecord({
      id: "image-context",
      filePath: imagePath,
      fileName: "ig_context.png",
      callId: "ig_context",
      generatedAt: "2026-05-21T11:46:00.000Z"
    }),
    timeline,
    { capturedAt: "2026-05-22T00:00:00.000Z" }
  );

  assert.equal(context.status, "available");
  assert.equal(context.source, "live_log");
  assert.equal(context.anchorTimestamp, "2026-05-21T11:46:00.000Z");
  assert.deepEqual(
    context.messages.map((message) => [message.position, message.role, message.text]),
    [
      [0, "user", "Make the poster calmer."],
      [1, "assistant", "Use quieter glass and more spacing."],
      [2, "user", "Keep the product visible."],
      [3, "assistant", "The first image is ready."],
      [4, "user", "Make it a bit brighter."]
    ]
  );
}

function createMessageLine(timestamp: string, role: string, content: unknown): string {
  return JSON.stringify({
    timestamp,
    payload: {
      type: `${role}_message`,
      role,
      content
    }
  });
}

async function testSqliteIncrementalIndex(root: string): Promise<void> {
  const dbPath = path.join(root, "incremental-index.sqlite");
  const index = await SqliteImageIndex.open(dbPath);
  try {
    const older = createImageRecord({
      id: "older",
      filePath: "/tmp/older.png",
      fileName: "older.png",
      generatedAt: "2026-05-20T00:00:00.000Z",
      fileModifiedAt: "2026-05-20T00:00:00.000Z",
      prompt: "older prompt",
      sizeBytes: 10
    });
    const newer = createImageRecord({
      id: "newer",
      filePath: "/tmp/newer.png",
      fileName: "newer.png",
      generatedAt: "2026-05-21T00:00:00.000Z",
      fileModifiedAt: "2026-05-21T00:00:00.000Z",
      prompt: "newer prompt",
      sizeBytes: 20
    });

    index.syncRecords([older, newer]);
    index.replaceImageContext({
      imageId: older.id,
      anchorTimestamp: older.generatedAt,
      status: "available",
      source: "live_log",
      capturedAt: "2026-05-22T00:00:00.000Z",
      messages: [
        {
          position: 0,
          role: "user",
          text: "older context",
          timestamp: "2026-05-20T00:00:00.000Z",
          source: "live_log",
          capturedAt: "2026-05-22T00:00:00.000Z"
        }
      ]
    } satisfies ImageContextResult);
    index.replaceImageContext({
      imageId: newer.id,
      anchorTimestamp: newer.generatedAt,
      status: "available",
      source: "live_log",
      capturedAt: "2026-05-22T00:00:00.000Z",
      messages: [
        {
          position: 0,
          role: "user",
          text: "newer context",
          timestamp: "2026-05-21T00:00:00.000Z",
          source: "live_log",
          capturedAt: "2026-05-22T00:00:00.000Z"
        }
      ]
    } satisfies ImageContextResult);

    const initialSearch = index.search({ limit: 20 });
    assert.equal(initialSearch.total, 2);
    assert.equal(initialSearch.items[0]?.id, "newer");
    assert.equal(initialSearch.items[0]?.promptSource, "revised_prompt");
    assert.equal(initialSearch.facets.totalImages, 2);
    assert.equal(index.getImageContext("older")?.messages[0]?.text, "older context");

    const updatedOlder = {
      ...older,
      threadName: "Updated title",
      prompt: "updated prompt",
      hasPrompt: true,
      fileModifiedAt: "2026-05-22T00:00:00.000Z",
      sizeBytes: 11
    };
    index.syncRecords([updatedOlder]);

    const updatedSearch = index.search({ query: "updated", limit: 20 });
    assert.equal(index.count(), 1);
    assert.equal(updatedSearch.total, 1);
    assert.equal(updatedSearch.items[0]?.id, "older");
    assert.equal(index.getById("newer"), null);
    assert.equal(index.getImageContext("newer"), null);
    assert.equal(index.getImageContext("older")?.messages[0]?.text, "older context");
    assert.equal(updatedSearch.facets.totalImages, 1);
  } finally {
    index.close();
  }
}

async function testCapabilityScanner(root: string): Promise<void> {
  const codexRoot = path.join(root, ".codex-capabilities");
  const projectRoot = path.join(root, "project");
  const userSkillDir = path.join(codexRoot, "skills", "draft-skill");
  const duplicateSkillDir = path.join(codexRoot, "skills", "draft-skill-copy");
  const pluginRoot = path.join(codexRoot, "plugins", "cache", "openai-curated", "build-web-apps", "6188456f");
  const pluginManifestDir = path.join(pluginRoot, ".codex-plugin");
  const pluginCommandDir = path.join(pluginRoot, "commands");
  const automationDir = path.join(codexRoot, "automations", "daily-run");

  await fs.mkdir(path.join(userSkillDir, "scripts"), { recursive: true });
  await fs.mkdir(duplicateSkillDir, { recursive: true });
  await fs.mkdir(pluginManifestDir, { recursive: true });
  await fs.mkdir(pluginCommandDir, { recursive: true });
  await fs.mkdir(automationDir, { recursive: true });
  await fs.mkdir(path.join(projectRoot, ".codex", "commands"), { recursive: true });

  await fs.writeFile(
    path.join(userSkillDir, "SKILL.md"),
    [
      "---",
      "name: draft-skill",
      "description: Draft structured release notes when the user asks for a concise changelog.",
      "---",
      "# Draft Skill"
    ].join("\n")
  );
  await fs.writeFile(
    path.join(userSkillDir, "scripts", "run.js"),
    "console.log('ok')\n"
  );
  await fs.writeFile(
    path.join(duplicateSkillDir, "SKILL.md"),
    [
      "---",
      "name: draft-skill",
      "description: Another draft skill with the same name.",
      "---"
    ].join("\n")
  );
  await fs.writeFile(
    path.join(pluginManifestDir, "plugin.json"),
    JSON.stringify({
      name: "build-web-apps",
      version: "0.1.0",
      description: "Build web apps.",
      interface: {
        category: "Coding",
        displayName: "Build Web Apps",
        shortDescription: "Build frontend-focused web apps."
      }
    })
  );
  await fs.writeFile(path.join(pluginCommandDir, "test-web-app.md"), "# Test web app\nRun browser checks.");
  await fs.writeFile(
    path.join(projectRoot, ".codex", "commands", "ship.md"),
    "# Ship\nPrepare the current change for review."
  );
  await fs.writeFile(
    path.join(automationDir, "automation.toml"),
    [
      'id = "daily-run"',
      'kind = "cron"',
      'name = "Daily Run"',
      'prompt = "Run one daily check."',
      'status = "PAUSED"',
      'rrule = "RRULE:FREQ=DAILY"'
    ].join("\n")
  );
  await fs.writeFile(
    path.join(codexRoot, "config.toml"),
    ['[plugins."build-web-apps@openai-curated"]', "enabled = true"].join("\n")
  );

  const scanner = new CodexCapabilityScanner({
    codexRoot,
    projectRoot,
    readMcpList: async () =>
      [
        "Name      Command    Args    Env    Cwd    Status   Auth",
        "browser   node       -       -      -      enabled  Unsupported"
      ].join("\n")
  });
  const result = await scanner.scan();

  assert.equal(result.summary.byKind.skill, 2);
  assert.equal(result.summary.byKind.plugin, 1);
  assert.equal(result.summary.byKind.command, 2);
  assert.equal(result.summary.byKind.automation, 1);
  assert.equal(result.summary.byKind.mcp, 1);
  assert.ok(result.summary.issueCount >= 3);

  const duplicateSkill = result.items.find((item) => item.kind === "skill" && item.name === "draft-skill");
  assert.equal(duplicateSkill?.source, "user");
  assert.ok(duplicateSkill?.issues.some((issue) => issue.code === "duplicate-capability-name"));
  assert.ok(duplicateSkill?.dependencies.some((dependency) => dependency.kind === "scripts" && dependency.count === 1));

  const plugin = result.items.find((item) => item.kind === "plugin" && item.name === "Build Web Apps");
  assert.equal(plugin?.status, "enabled");
  assert.equal(plugin?.metadata.id, "build-web-apps@openai-curated");

  const projectCommand = result.items.find((item) => item.kind === "command" && item.name === "ship");
  assert.equal(projectCommand?.source, "project");
  assert.equal(projectCommand?.trigger, "/ship");

  const automation = result.items.find((item) => item.kind === "automation" && item.name === "Daily Run");
  assert.equal(automation?.status, "disabled");

  const mcp = result.items.find((item) => item.kind === "mcp" && item.name === "browser");
  assert.equal(mcp?.status, "enabled");
}

function testSearchUiRendering(): void {
  const noop = () => undefined;
  const image = createImageRecord({
    id: "image-a",
    filePath: "/tmp/image-a.png",
    fileName: "ig_image_a.png",
    sessionId: "session-a",
    threadName: "制作 Apple 3D 海报",
    generatedAt: "2026-05-21T11:46:07.558Z",
    fileModifiedAt: "2026-05-21T11:46:07.558Z",
    prompt: "Create a clean Apple poster with glass detail.",
    promptSource: "revised_prompt",
    promptCapturedAt: "2026-05-21T11:46:07.558Z",
    width: 1,
    height: 1,
    sizeBytes: 68,
    callId: "ig_image_a",
    sessionPath: "/tmp/session.jsonl",
    hasPrompt: true
  });
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
  assert.match(openOverlay, /\/api\/images\/image-a\/thumb/);
  assert.match(openOverlay, /制作 Apple 3D 海报/);
  assert.match(openOverlay, />title</);

  const sidebarMarkup = renderToStaticMarkup(
    createElement(Sidebar, {
      activeModule: "gallery",
      capabilitySection: "overview",
      capabilitySummary: null,
      collapsed: false,
      datePreset: "all",
      imageFacets: createImageFacets(),
      promptState: "all",
      sessionId: undefined,
      sessions: [{ sessionId: "session-a", threadName: "Design notes", count: 3 }],
      onCapabilitySectionChange: noop,
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
  assert.match(sidebarMarkup, /sidebar-module-header/);
  assert.match(sidebarMarkup, />图片浏览</);
  assert.equal(sidebarMarkup.includes(">CM<"), false);
  assert.equal(sidebarMarkup.includes("Local"), false);
  assert.equal(sidebarMarkup.includes("Sync"), false);
  assert.equal(sidebarMarkup.includes("42 images"), false);
  assert.equal(sidebarMarkup.includes("floating-search"), false);
  assert.equal(sidebarMarkup.includes("Settings"), false);

  const collapsedSidebarMarkup = renderToStaticMarkup(
    createElement(Sidebar, {
      activeModule: "gallery",
      capabilitySection: "overview",
      capabilitySummary: null,
      collapsed: true,
      datePreset: "all",
      imageFacets: createImageFacets(),
      promptState: "all",
      sessionId: undefined,
      sessions: [],
      onCapabilitySectionChange: noop,
      onDatePresetChange: noop,
      onPromptStateChange: noop,
      onSessionChange: noop
    })
  );
  assert.match(collapsedSidebarMarkup, /class="sidebar collapsed"/);
  assert.equal(collapsedSidebarMarkup.includes("rail-brand"), false);
  assert.equal(collapsedSidebarMarkup.includes(">CM<"), false);

  const railMarkup = renderToStaticMarkup(
    createElement(GlobalRail, {
      activeModule: "gallery",
      onActiveModuleChange: noop
    })
  );
  assert.match(railMarkup, /class="global-rail"/);
  assert.match(railMarkup, /alt="CoMate"/);
  assert.match(railMarkup, /aria-label="图片浏览"/);

  const detailContext = {
    imageId: image.id,
    anchorTimestamp: image.generatedAt,
    status: "available",
    source: "live_log",
    capturedAt: "2026-05-22T00:00:00.000Z",
    messages: [
      {
        position: 0,
        role: "user",
        text: "Make the glass softer.",
        timestamp: "2026-05-21T11:45:00.000Z",
        source: "live_log",
        capturedAt: "2026-05-22T00:00:00.000Z"
      }
    ]
  } satisfies ImageContextResult;
  const detailMarkup = renderToStaticMarkup(
    createElement(DetailPanel, { context: detailContext, image, onCopyImage: noop })
  );
  const promptIndex = detailMarkup.indexOf(">Prompt<");
  const contextIndex = detailMarkup.indexOf(">Context<");
  const detailsIndex = detailMarkup.indexOf(">Details<");
  assert.ok(promptIndex >= 0);
  assert.ok(contextIndex > promptIndex);
  assert.ok(detailsIndex > contextIndex);
  assert.match(detailMarkup, /role="tablist"/);
  assert.match(detailMarkup, /class="detail-tab active"/);
  assert.match(detailMarkup, /class="detail-tab-panel detail-tab-panel-prompt"/);
  assert.match(detailMarkup, /class="prompt-reader"/);
  assert.match(detailMarkup, /Exact prompt/);
  assert.match(detailMarkup, /aria-label="Copy image"/);
  assert.match(detailMarkup, /aria-label="Open image"/);
  assert.match(detailMarkup, /aria-label="Reveal in folder"/);
  assert.match(detailMarkup, />Copy</);
  assert.match(detailMarkup, />Open</);
  assert.match(detailMarkup, />Folder</);
  assert.equal((detailMarkup.match(/detail-action-button/g) ?? []).length, 3);
  assert.match(detailMarkup, /aria-label="Copy prompt"/);
  assert.equal(detailMarkup.includes('aria-label="Copy file path"'), false);
  assert.match(detailMarkup, /制作 Apple 3D 海报/);

  const contextMarkup = renderToStaticMarkup(
    createElement(DetailPanel, {
      context: detailContext,
      image: createImageRecord({ hasPrompt: false, prompt: null, promptCapturedAt: null, promptSource: "none" }),
      onCopyImage: noop
    })
  );
  assert.match(contextMarkup, /class="detail-tab-panel detail-tab-panel-context"/);
  assert.match(contextMarkup, /Local session log/);
  assert.match(contextMarkup, /Before/);
  assert.match(contextMarkup, /Image generated here/);
  assert.match(contextMarkup, /Make the glass softer/);
  assert.match(contextMarkup, /aria-label="Copy context"/);
}

function testWorkspaceLayoutModel(): void {
  const image = createImageRecord({
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
  });

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

function testCapabilityViewModel(): void {
  const graph = createCapabilityGraph();
  assert.equal(filterCapabilities(graph, "overview", "").length, 3);
  assert.equal(filterCapabilities(graph, "skills", "").length, 1);
  assert.equal(filterCapabilities(graph, "issues", "").length, 1);
  assert.equal(filterCapabilities(graph, "overview", "browser").length, 1);
  assert.equal(getCapabilityMenuCount(graph.summary, "plugins"), 1);
  assert.equal(getCapabilityMenuCount(graph.summary, "issues"), 1);
  assert.equal(getSelectedCapability(graph.items, null)?.name, "imagegen");
  assert.equal(getSelectedCapability(graph.items, "plugin-browser")?.name, "Browser");
}

function testImagePaginationModel(): void {
  const a = createImageRecord({ id: "a", filePath: "/tmp/a.png" });
  const b = createImageRecord({ id: "b", filePath: "/tmp/b.png" });
  const updatedA = createImageRecord({ id: "a", filePath: "/tmp/a.png", threadName: "updated" });

  assert.deepEqual(
    mergeImagePages([a], [b, updatedA], 2).map((image) => [image.id, image.threadName]),
    [
      ["a", "updated"],
      ["b", b.threadName]
    ]
  );
  assert.equal(canLoadNextImagePage({ loading: false, loadingMore: false, nextOffset: 120, total: 240 }), true);
  assert.equal(canLoadNextImagePage({ loading: true, loadingMore: false, nextOffset: 120, total: 240 }), false);
  assert.equal(canLoadNextImagePage({ loading: false, loadingMore: false, nextOffset: 240, total: 240 }), false);
}

function testSidebarResizeModel(): void {
  assert.equal(clampSidebarWidth(120), SIDEBAR_WIDTH_CONFIG.minWidth);
  assert.equal(clampSidebarWidth(260), 260);
  assert.equal(clampSidebarWidth(420), SIDEBAR_WIDTH_CONFIG.maxWidth);
  assert.equal(clampSidebarWidth(Number.NaN), SIDEBAR_WIDTH_CONFIG.defaultWidth);
  assert.equal(getSidebarWidthCssValue(240), "240px");

  const resized = getSidebarDragResult({
    currentWidth: SIDEBAR_WIDTH_CONFIG.defaultWidth,
    pointerX: 250,
    startPanelState: "expanded",
    startPointerX: 200,
    startWidth: SIDEBAR_WIDTH_CONFIG.defaultWidth
  });
  assert.deepEqual(resized, {
    panelState: "expanded",
    shouldCompleteDrag: false,
    width: SIDEBAR_WIDTH_CONFIG.defaultWidth + 50
  });

  const collapsedFromExpanded = getSidebarDragResult({
    currentWidth: SIDEBAR_WIDTH_CONFIG.defaultWidth,
    pointerX: 120,
    startPanelState: "expanded",
    startPointerX: 200,
    startWidth: SIDEBAR_WIDTH_CONFIG.defaultWidth
  });
  assert.deepEqual(collapsedFromExpanded, {
    panelState: "collapsed",
    shouldCompleteDrag: true,
    width: SIDEBAR_WIDTH_CONFIG.defaultWidth
  });

  const staysCollapsedUntilThreshold = getSidebarDragResult({
    currentWidth: SIDEBAR_WIDTH_CONFIG.defaultWidth,
    pointerX: 140,
    startPanelState: "collapsed",
    startPointerX: 100,
    startWidth: SIDEBAR_WIDTH_CONFIG.defaultWidth
  });
  assert.deepEqual(staysCollapsedUntilThreshold, {
    panelState: "collapsed",
    shouldCompleteDrag: false,
    width: SIDEBAR_WIDTH_CONFIG.defaultWidth
  });

  const expandsFromCollapsed = getSidebarDragResult({
    currentWidth: SIDEBAR_WIDTH_CONFIG.defaultWidth,
    pointerX: 260,
    startPanelState: "collapsed",
    startPointerX: 100,
    startWidth: SIDEBAR_WIDTH_CONFIG.defaultWidth
  });
  assert.deepEqual(expandsFromCollapsed, {
    panelState: "expanded",
    shouldCompleteDrag: false,
    width: SIDEBAR_WIDTH_CONFIG.minWidth
  });
}

function testSidebarResizeHandleRendering(): void {
  const markup = renderToStaticMarkup(
    createElement(SidebarResizeHandle, {
      "aria-label": "Resize sidebar",
      "aria-orientation": "vertical",
      "aria-valuemax": SIDEBAR_WIDTH_CONFIG.maxWidth,
      "aria-valuemin": SIDEBAR_WIDTH_CONFIG.minWidth,
      "aria-valuenow": SIDEBAR_WIDTH_CONFIG.defaultWidth,
      isResizing: true,
      panelState: "expanded",
      role: "separator",
      tabIndex: 0
    })
  );

  assert.match(markup, /class="sidebar-resize-handle resizing"/);
  assert.match(markup, /role="separator"/);
  assert.match(markup, /aria-orientation="vertical"/);
  assert.match(markup, new RegExp(`aria-valuenow="${SIDEBAR_WIDTH_CONFIG.defaultWidth}"`));

  const collapsedMarkup = renderToStaticMarkup(
    createElement(SidebarResizeHandle, {
      isResizing: false,
      panelState: "collapsed",
      role: "separator"
    })
  );
  assert.match(collapsedMarkup, /class="sidebar-resize-handle collapsed"/);
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
      viewMode: "grid",
      viewModeVisible: true,
      onMetaVisibleChange: noop,
      onRefresh: noop,
      onSearchOpen: noop,
      onToggleLeftPanel: noop,
      onToggleRightPanel: noop,
      onViewModeChange: noop
    })
  );

  assert.match(expandedMarkup, /class="workspace-bar"/);
  assert.match(expandedMarkup, /Collapse sidebar/);
  assert.match(expandedMarkup, /Collapse inspector/);
  assert.match(expandedMarkup, /data-panel-side="left"/);
  assert.match(expandedMarkup, /data-panel-side="right"/);
  assert.match(expandedMarkup, /aria-expanded="true"/);
  assert.match(expandedMarkup, />Search images\.\.\.</);
  assert.match(expandedMarkup, /Grid view/);
  assert.match(expandedMarkup, /List view/);
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
  const image = createImageRecord({
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
  });

  const detailedMarkup = renderToStaticMarkup(
    createElement(GalleryPane, {
      canLoadMore: false,
      images: [image],
      loading: false,
      loadingMore: false,
      metaVisible: true,
      selectedId: image.id,
      total: 1,
      viewMode: "grid",
      onLoadMore: noop,
      onSelect: noop
    })
  );
  assert.match(detailedMarkup, /class="tile-meta"/);
  assert.match(detailedMarkup, /\/api\/images\/image-a\/thumb/);
  assert.equal(detailedMarkup.includes("tile-check"), false);

  const cleanMarkup = renderToStaticMarkup(
    createElement(GalleryPane, {
      canLoadMore: false,
      images: [image],
      loading: false,
      loadingMore: false,
      metaVisible: false,
      selectedId: image.id,
      total: 1,
      viewMode: "grid",
      onLoadMore: noop,
      onSelect: noop
    })
  );
  assert.match(cleanMarkup, /gallery gallery-clean/);
  assert.equal(cleanMarkup.includes('class="tile-meta"'), false);

  const listMarkup = renderToStaticMarkup(
    createElement(GalleryPane, {
      canLoadMore: false,
      images: [image],
      loading: false,
      loadingMore: false,
      metaVisible: false,
      selectedId: image.id,
      total: 1,
      viewMode: "list",
      onLoadMore: noop,
      onSelect: noop
    })
  );
  assert.match(listMarkup, /class="gallery-list"/);
  assert.match(listMarkup, /class="image-list-row selected"/);
  assert.match(listMarkup, /\/api\/images\/image-a\/thumb/);
  assert.match(listMarkup, /Prompt/);
}

async function testImageClipboardModel(): Promise<void> {
  const image = createImageRecord({
    fileName: "ig_image_a.png",
    fileModifiedAt: "2026-05-21T11:46:07.558Z"
  });
  const writes: unknown[] = [];
  const requestedUrls: string[] = [];
  class MockClipboardItem {
    constructor(readonly items: Record<string, Blob>) {}
  }

  const result = await copyImageBinaryToClipboard(image, {
    ClipboardItem: MockClipboardItem as unknown as typeof ClipboardItem,
    clipboard: {
      write: async (items) => {
        writes.push(items);
      }
    },
    fetch: (async (input) => {
      requestedUrls.push(String(input));
      return new Response(new Blob(["image-bytes"], { type: "image/png" }), { status: 200 });
    }) as typeof fetch
  });

  assert.deepEqual(result, { mimeType: "image/png", native: false, size: 11 });
  assert.equal(writes.length, 1);
  assert.equal(requestedUrls[0], "/api/images/image-a/file?v=2026-05-21T11%3A46%3A07.558Z");

  const nativeResult = await copyImageBinaryToClipboard(image, {
    ClipboardItem: null,
    clipboard: null,
    fetch: null,
    nativeCopyImage: async () => ({ mimeType: "image/png", native: true, size: 68 })
  });
  assert.deepEqual(nativeResult, { mimeType: "image/png", native: true, size: 68 });

  const fallbackResult = await copyImageBinaryToClipboard(image, {
    ClipboardItem: MockClipboardItem as unknown as typeof ClipboardItem,
    clipboard: {
      write: async () => undefined
    },
    fetch: (async () => new Response(new Blob(["fallback"], { type: "image/png" }), { status: 200 })) as typeof fetch,
    nativeCopyImage: async () => {
      throw new Error("Native clipboard unavailable.");
    }
  });
  assert.deepEqual(fallbackResult, { mimeType: "image/png", native: false, size: 8 });

  assert.equal(getClipboardImageMimeType("", "photo.jpeg"), "image/jpeg");
  assert.equal(getClipboardImageMimeType("", "photo.webp"), "image/webp");
  assert.equal(getClipboardImageMimeType("", "photo.png"), "image/png");
  assert.equal(
    shouldHandleImageCopyShortcut({
      key: "c",
      metaKey: true,
      target: null
    }),
    true
  );
  assert.equal(
    shouldHandleImageCopyShortcut({
      key: "c",
      metaKey: true,
      target: { tagName: "INPUT" } as unknown as EventTarget
    }),
    false
  );
  assert.equal(
    shouldHandleImageCopyShortcut({
      key: "c",
      ctrlKey: true,
      metaKey: false,
      target: null
    }),
    false
  );
  await assert.rejects(
    () =>
      copyImageBinaryToClipboard(image, {
        ClipboardItem: MockClipboardItem as unknown as typeof ClipboardItem,
        clipboard: null,
        fetch: (async () => new Response(new Blob(["image-bytes"], { type: "image/png" }))) as typeof fetch
      }),
    /Image clipboard is not available/
  );
}

function testThumbnailCacheModel(root: string): void {
  const cacheDir = path.join(root, "thumbnail-cache");
  const image = createImageRecord({
    id: "abcdef123456",
    fileModifiedAt: "2026-05-21T11:46:07.558Z",
    sizeBytes: 68
  });
  const firstPath = getThumbnailCachePath(cacheDir, image);
  const samePath = getThumbnailCachePath(cacheDir, { ...image });
  const changedPath = getThumbnailCachePath(cacheDir, { ...image, sizeBytes: 69 });

  assert.equal(firstPath, samePath);
  assert.notEqual(firstPath, changedPath);
  assert.match(firstPath, /thumbnail-cache\/ab\/abcdef123456-[0-9a-f]{16}\.png$/);
}

function testCapabilityViewRendering(): void {
  const noop = () => undefined;
  const graph = createCapabilityGraph();

  const sidebarMarkup = renderToStaticMarkup(
    createElement(Sidebar, {
      activeModule: "capabilities",
      capabilitySection: "skills",
      capabilitySummary: graph.summary,
      collapsed: false,
      datePreset: "all",
      imageFacets: createImageFacets({ totalImages: 0 }),
      promptState: "all",
      sessionId: undefined,
      sessions: [],
      onCapabilitySectionChange: noop,
      onDatePresetChange: noop,
      onPromptStateChange: noop,
      onSessionChange: noop
    })
  );
  assert.match(sidebarMarkup, /能力图谱/);
  assert.match(sidebarMarkup, />Skills</);
  assert.match(sidebarMarkup, /capability-sidebar-note/);
  assert.equal(sidebarMarkup.includes(">Sessions<"), false);

  const workspaceMarkup = renderToStaticMarkup(
    createElement(CapabilityWorkspace, {
      capabilities: graph,
      error: null,
      loading: false,
      query: "",
      section: "overview",
      selectedId: "skill-imagegen",
      onQueryChange: noop,
      onSelect: noop
    })
  );
  assert.match(workspaceMarkup, /class="capability-workspace"/);
  assert.match(workspaceMarkup, />Skills</);
  assert.match(workspaceMarkup, /imagegen/);
  assert.match(workspaceMarkup, /Browser/);
  assert.match(workspaceMarkup, /status-warning/);
  assert.match(workspaceMarkup, /issues need attention/);
  assert.equal(workspaceMarkup.includes("capability-stats"), false);

  const inspectorMarkup = renderToStaticMarkup(
    createElement(CapabilityInspector, {
      capability: graph.items[0],
      collapsed: false,
      onOpenPath: noop
    })
  );
  assert.match(inspectorMarkup, /capability-inspector/);
  assert.match(inspectorMarkup, /需要注意/);
  assert.match(inspectorMarkup, /Description 偏长/);
  assert.match(inspectorMarkup, /使用方式/);
  assert.match(inspectorMarkup, /资源/);
  assert.match(inspectorMarkup, /位置/);
  assert.match(inspectorMarkup, />打开</);
  assert.equal(inspectorMarkup.includes(">Details<"), false);
  assert.equal(inspectorMarkup.includes(">Trigger<"), false);
}

function createCapabilityGraph(): CapabilityScanResult {
  const skill = createCapability({
    id: "skill-imagegen",
    name: "imagegen",
    kind: "skill",
    source: "user",
    status: "warning",
    issues: [{ code: "skill-description-long", message: "description is long", severity: "warning" }],
    dependencies: [{ kind: "scripts", label: "Scripts", path: "/tmp/scripts", status: "available", count: 2 }]
  });
  const plugin = createCapability({
    id: "plugin-browser",
    name: "Browser",
    kind: "plugin",
    source: "plugin",
    status: "enabled"
  });
  const automation = createCapability({
    id: "automation-lumi",
    name: "lumi-task",
    kind: "automation",
    source: "user",
    status: "disabled"
  });

  return {
    items: [skill, plugin, automation],
    issues: [],
    scannedAt: "2026-05-23T00:00:00.000Z",
    summary: {
      total: 3,
      issueCount: 1,
      byKind: {
        automation: 1,
        command: 0,
        mcp: 0,
        plugin: 1,
        skill: 1
      },
      bySource: {
        plugin: 1,
        project: 0,
        runtime: 0,
        system: 0,
        user: 2
      },
      byStatus: {
        disabled: 1,
        enabled: 1,
        unknown: 0,
        warning: 1
      }
    }
  };
}

function createCapability(overrides: Partial<CapabilityRecord>): CapabilityRecord {
  return {
    id: "capability",
    name: "Capability",
    kind: "skill",
    source: "user",
    status: "enabled",
    description: "Capability description",
    path: "/tmp/capability/SKILL.md",
    origin: "skills",
    trigger: "Capability trigger",
    updatedAt: "2026-05-23T00:00:00.000Z",
    issues: [],
    dependencies: [],
    metadata: {},
    ...overrides
  };
}

function createImageRecord(overrides: Partial<ImageRecord> = {}): ImageRecord {
  return {
    id: "image-a",
    filePath: "/tmp/image-a.png",
    fileName: "ig_image_a.png",
    sessionId: "session-a",
    threadName: "制作 Apple 3D 海报",
    generatedAt: "2026-05-21T11:46:07.558Z",
    fileModifiedAt: "2026-05-21T11:46:07.558Z",
    prompt: "Create a clean Apple poster with glass detail.",
    promptSource: "revised_prompt",
    promptCapturedAt: "2026-05-21T11:46:07.558Z",
    width: 1,
    height: 1,
    sizeBytes: 68,
    callId: "ig_image_a",
    sessionPath: "/tmp/session.jsonl",
    hasPrompt: true,
    ...overrides
  };
}

function createImageFacets(overrides: Partial<ImageSearchResult["facets"]> = {}): ImageSearchResult["facets"] {
  return {
    sessions: [],
    last30Days: 18,
    last7Days: 9,
    today: 2,
    totalImages: 42,
    withPrompt: 30,
    withoutPrompt: 12,
    ...overrides
  };
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

async function testDesktopNativeClipboardEndpoint(root: string): Promise<void> {
  const sessionId = "019e4a58-2295-78d2-ae37-3a8c0f2fa4dc";
  const codexRoot = path.join(root, ".codex-native-clipboard");
  const generatedImagesDir = path.join(codexRoot, "generated_images");
  const imageDir = path.join(generatedImagesDir, sessionId);
  const sessionsDir = path.join(codexRoot, "sessions");
  const sessionLogDir = path.join(sessionsDir, "2026", "05", "21");
  const sessionLogPath = path.join(sessionLogDir, `rollout-2026-05-21T19-42-30-${sessionId}.jsonl`);
  const databasePath = path.join(root, "native-clipboard.sqlite");
  const imagePath = path.join(imageDir, "ig_native_clipboard.png");
  const thumbnailPath = path.join(root, "native-thumb.png");
  const copiedPaths: string[] = [];
  const thumbIds: string[] = [];
  const port = await findAvailablePort(48_980);

  await fs.mkdir(imageDir, { recursive: true });
  await fs.mkdir(sessionLogDir, { recursive: true });
  await fs.writeFile(imagePath, Buffer.from(PNG_1X1, "base64"));
  await fs.writeFile(thumbnailPath, Buffer.from(PNG_1X1, "base64"));
  await fs.writeFile(
    sessionLogPath,
    [
      createMessageLine("2026-05-21T11:45:00.000Z", "user", "Use a quiet gallery crop."),
      JSON.stringify({
        timestamp: "2026-05-21T11:46:00.000Z",
        payload: {
          type: "image_generation_end",
          call_id: "ig_native_clipboard",
          saved_path: imagePath,
          revised_prompt: "A quiet gallery crop."
        }
      }),
      createMessageLine("2026-05-21T11:47:00.000Z", "assistant", "Here is the image.")
    ].join("\n")
  );

  const runtime = await startCoMateRuntime({
    codexPaths: {
      codexRoot,
      databasePath,
      generatedImagesDir,
      sessionIndexPath: path.join(codexRoot, "session_index.jsonl"),
      sessionsDir
    },
    imageClipboard: {
      copyImageFile: async (filePath) => {
        copiedPaths.push(filePath);
        const stat = await fs.stat(filePath);
        return {
          mimeType: "image/png",
          native: true,
          size: stat.size
        } satisfies ImageCopyResult;
      }
    },
    thumbnails: {
      getThumbnail: async (image) => {
        thumbIds.push(image.id);
        return { filePath: thumbnailPath, mimeType: "image/png" };
      }
    },
    port,
    staticDir: null
  });

  try {
    await runtime.initialIndex;
    const imageResponse = await fetch(`${runtime.url}/api/images`);
    const images = (await imageResponse.json()) as ImageSearchResult;
    assert.equal(images.total, 1);

    const image = images.items[0]!;
    assert.equal(image.prompt, "A quiet gallery crop.");
    assert.equal(image.promptSource, "revised_prompt");

    const liveContextResponse = await fetch(`${runtime.url}/api/images/${encodeURIComponent(image.id)}/context`);
    const liveContext = (await liveContextResponse.json()) as ImageContextResult;
    assert.equal(liveContext.status, "available");
    assert.equal(liveContext.source, "live_log");
    assert.deepEqual(liveContext.messages.map((message) => message.text), [
      "Use a quiet gallery crop.",
      "Here is the image."
    ]);

    const thumbnailResponse = await fetch(`${runtime.url}/api/images/${encodeURIComponent(image.id)}/thumb`);
    const thumbnailBytes = Buffer.from(await thumbnailResponse.arrayBuffer());
    assert.equal(thumbnailResponse.ok, true);
    assert.equal(thumbnailResponse.headers.get("content-type"), "image/png");
    assert.equal(thumbnailBytes.length, Buffer.from(PNG_1X1, "base64").length);
    assert.deepEqual(thumbIds, [image.id]);

    const copyResponse = await fetch(`${runtime.url}/api/images/${encodeURIComponent(image.id)}/copy`, {
      method: "POST"
    });
    const copyResult = (await copyResponse.json()) as ImageCopyResult;

    assert.equal(copyResponse.ok, true);
    assert.deepEqual(copyResult, {
      mimeType: "image/png",
      native: true,
      size: Buffer.from(PNG_1X1, "base64").length
    });
    assert.deepEqual(copiedPaths, [imagePath]);

    await fs.rm(sessionLogPath);
    const cachedContextResponse = await fetch(`${runtime.url}/api/images/${encodeURIComponent(image.id)}/context`);
    const cachedContext = (await cachedContextResponse.json()) as ImageContextResult;
    assert.equal(cachedContext.status, "cached");
    assert.equal(cachedContext.source, "cached");
    assert.deepEqual(cachedContext.messages.map((message) => message.source), ["cached", "cached"]);
  } finally {
    await runtime.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

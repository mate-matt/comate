import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LibraryService } from "../src/server/application/libraryService.js";
import { CodexImageScanner } from "../src/server/infrastructure/codexImageScanner.js";
import { CodexSessionRepository } from "../src/server/infrastructure/codexSessionRepository.js";
import { SqliteImageIndex } from "../src/server/infrastructure/sqliteImageIndex.js";
import { DetailPanel } from "../src/web/components/DetailPanel.js";
import { SearchOverlay } from "../src/web/components/SearchOverlay.js";
import { Sidebar } from "../src/web/components/Sidebar.js";

const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-mate-test-"));

  try {
    await testScannerSessionMergeAndIndex(root);
    console.log("ok scanner/session/index");
    testSearchUiRendering();
    console.log("ok web/search-ui");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
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
      datePreset: "all",
      imageTotal: 42,
      loading: false,
      promptState: "all",
      query: "Apple",
      refreshing: false,
      sessionId: undefined,
      sessions: [{ sessionId: "session-a", threadName: "Design notes", count: 3 }],
      onDatePresetChange: noop,
      onPromptStateChange: noop,
      onRefresh: noop,
      onSearchOpen: noop,
      onSessionChange: noop
    })
  );

  const searchIndex = sidebarMarkup.indexOf(">Search<");
  const withPromptIndex = sidebarMarkup.indexOf(">With prompt<");
  assert.ok(searchIndex >= 0);
  assert.ok(withPromptIndex > searchIndex);
  assert.match(sidebarMarkup, /filter-item active search-entry/);
  assert.equal(sidebarMarkup.includes("floating-search"), false);
  assert.equal(sidebarMarkup.includes("Settings"), false);

  const detailMarkup = renderToStaticMarkup(createElement(DetailPanel, { image }));
  const promptIndex = detailMarkup.indexOf(">Prompt<");
  const titleIndex = detailMarkup.indexOf(">Title<");
  assert.ok(promptIndex >= 0);
  assert.ok(titleIndex > promptIndex);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

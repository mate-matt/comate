# Codex Mate

Codex Mate is a local companion app for the Codex desktop app. It scans Codex Desktop-generated images on your machine, links them back to session metadata and prompts, and serves a clean private gallery.

Codex Mate runs completely locally. It reads local Codex Desktop data and does not need a network connection for your library.

## Commands

```bash
npm install
npm run test
npm run dev
```

Production mode:

```bash
npm run build
npm start
```

Desktop app:

```bash
npm run desktop
npm run package:mac
open "release/mac-arm64/Codex Mate.app"
```

Default URLs:

- Web UI: http://127.0.0.1:4388
- API in dev: http://127.0.0.1:4389

Default Codex source:

```text
~/.codex/generated_images
~/.codex/session_index.jsonl
~/.codex/sessions
```

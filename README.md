# Codex Mate

Codex Mate is a local imagegen library for Codex. It scans Codex-generated images, links them back to session metadata and prompts, and serves a clean local Web UI.

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

Default URLs:

- Web UI: http://127.0.0.1:4388
- API in dev: http://127.0.0.1:4389

Default Codex source:

```text
~/.codex/generated_images
~/.codex/session_index.jsonl
~/.codex/sessions
```

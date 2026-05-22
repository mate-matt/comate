# Open Source Release Notes

This document tracks the public-release checklist for Codex Mate.

## Positioning

Codex Mate is a local companion app for the Codex desktop app, not Codex CLI. It scans Codex Desktop-generated images on the user's machine, links them to local session metadata, and presents a private gallery.

## Privacy Model

- Runs locally.
- Reads local Codex Desktop data.
- Uses a localhost-only server for the UI.
- Does not require login, API keys, telemetry, analytics, or network access for the image library.
- Keeps generated images and session logs out of the repository.

## Repository Hygiene

- `node_modules/`, `dist-*`, `release/`, `.env*`, `.codex-mate*`, logs, and coverage are ignored.
- MIT license is included.
- Contribution and security guidelines are included.
- GitHub Actions run tests and production builds on pull requests and pushes.

## Release Workflow

The release workflow builds unsigned macOS artifacts on GitHub Actions:

- manual run: creates downloadable workflow artifacts
- `v*` tag: publishes a GitHub Release with `.dmg` and `.zip` assets

The first public builds are unsigned. A signed and notarized macOS release will require Apple Developer credentials configured as GitHub repository secrets.

## Pre-Release Checklist

- [ ] Confirm README screenshots or demo media are safe to publish.
- [ ] Confirm no private local paths, generated images, session logs, or databases are tracked.
- [ ] Push the repository to GitHub as public.
- [ ] Verify the first CI run passes.
- [ ] Run the packaging workflow manually.
- [ ] Create a `v0.1.0` tag when ready to publish the first release.

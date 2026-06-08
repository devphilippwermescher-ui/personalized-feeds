# AGENTS.md

Project guide for working in this repository with Codex / project-local agents.

## Project Overview

`linkedin-feed-sorter` is a monorepo with three main areas:

- `extension/` - Chrome extension (Webpack, React, TypeScript, Manifest V3)
- `dashboard/` - web dashboard (Vite, React, TypeScript)
- `shared/` - shared Firebase config, Firestore helpers, and shared types

Primary product behavior:

- collect and process LinkedIn feed/profile data in the extension
- manage feeds and members through extension UI
- show account/feed data in the dashboard
- persist app data through Firebase / Firestore

## Working Style

- Prefer small, isolated changes.
- Do not overwrite existing user changes.
- Before editing, identify whether the work belongs to `extension`, `dashboard`, or `shared`.
- When changing shared types or Firestore behavior, review both app surfaces for compatibility.
- Keep TypeScript strictness intact and avoid `any` unless there is no practical alternative.

## Repo Map

- `extension/src/background/` - background service worker logic
- `extension/src/content/` - LinkedIn page integrations, overlays, feed/sidebar/profile flows
- `extension/src/popup/` - extension popup UI
- `dashboard/src/pages/` - dashboard routes/pages
- `dashboard/src/components/` - dashboard UI components
- `shared/` - shared Firebase service code and types
- `firebase.json`, `firestore.rules`, `firestore.indexes.json` - Firebase config

## Common Commands

From repo root:

- `npm install`
- `npm run install:all`
- `npm run dev:extension`
- `npm run dev:dashboard`
- `npm run build`
- `npm run build:extension`
- `npm run build:dashboard`
- `npm run type-check`
- `npm run lint`
- `npm run format:check`

Targeted package commands:

- `cd extension && npm run dev`
- `cd extension && npm run build`
- `cd extension && npm run type-check`
- `cd extension && npm run lint`
- `cd dashboard && npm run dev`
- `cd dashboard && npm run build`
- `cd dashboard && npm run type-check`

## Change Heuristics

### Extension work

- Be careful with LinkedIn DOM selectors and rendering assumptions.
- Prefer reusing existing content-script utilities before adding new DOM helpers.
- For UI injected into LinkedIn, verify styles do not leak or break host layout.
- Keep message passing between content/background scripts explicit.

### Dashboard work

- Keep page-level data loading in hooks/pages and presentational logic in components.
- Reuse shared types from `shared/` when data overlaps with extension state.
- Preserve current routing and auth flow.

### Firebase / shared work

- If Firestore models change, validate impact on both extension and dashboard.
- Keep rules and indexes aligned with new query patterns.

## Validation Checklist

Choose the smallest relevant set:

- `npm run type-check`
- `npm run lint`
- `npm run build:extension`
- `npm run build:dashboard`
- smoke-test the affected UI surface

For extension-heavy changes also verify:

- the extension still builds
- the content script still injects cleanly
- popup/sidebar/profile flows do not regress

## Local Codex Helpers

Additional project-local helpers live in:

- `.Codex/agents/` - agent role definitions for focused work
- `.Codex/skills/` - reusable task playbooks
- `.Codex/README.md` - quick guide for this setup

Start with the agent or skill closest to the task instead of using a generic prompt every time.

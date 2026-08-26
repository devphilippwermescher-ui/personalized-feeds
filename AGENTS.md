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

## Architecture Rules

Use these rules for every new file and whenever an existing feature is materially changed.

### Choose the narrowest correct owner

1. Code used by both `extension` and `dashboard` belongs in `shared/` only when it is platform-neutral.
2. Code reused by multiple features in one app belongs in that app's shared `components/`, `hooks/`, `services/`, or `utils/` directory.
3. Code used by one feature belongs inside that feature directory, even if it is split into several files.
4. Do not move code to a global directory merely because it might be reusable someday. Promote it after a second real consumer appears, or when it is intrinsically generic (for example date arithmetic or safe JSON traversal).

Dependencies must point inward in this order:

`page/entrypoint -> feature component or hook -> feature service/logic -> app utility -> shared`

- `shared/` must never import from `extension/` or `dashboard/`.
- Pure utilities and parsers must not import React, DOM globals, Chrome APIs, Firebase, or UI components.
- Presentational components must not call Firestore, Chrome messaging, or LinkedIn endpoints directly.
- Pages and entrypoints compose features; they must not contain parsers, substantial data transformations, or reusable UI implementations.

### Dashboard organization

Use a feature-first structure for non-trivial dashboard work:

```text
dashboard/src/
  pages/                         route-level composition only
  features/<feature>/
    components/                  feature UI, one primary component per file
    hooks/                       state, effects, and view-model composition
    services/                    external I/O owned by the feature
    utils/                       pure feature-specific transformations
    types.ts                     feature-local shared types
    constants.ts                 feature-local constants
  components/                    UI reused across multiple dashboard features
  hooks/                         hooks reused across multiple dashboard features
  services/                      dashboard-wide external I/O
  utils/                         dashboard-wide pure utilities
```

- A page should normally read as a short composition of feature components and hooks.
- Keep data fetching and derived view-model state in hooks. Keep pure series builders, format conversion, and filtering in `utils/`.
- A component file may contain tiny private render helpers, but reusable or stateful child components get their own files.
- Keep CSS organized by surface or feature. Do not add unrelated styles to a convenient existing stylesheet.

### Extension organization

- `content/<feature>/` owns DOM integration, components, feature logic, styles, and tests for one injected LinkedIn feature.
- `background/` entrypoints and message handlers route work; domain operations live in focused service modules.
- Files named `*-api.ts` orchestrate requests and responses. Put payload parsing and model mapping in `*-parser.ts` or a feature `parsers/` directory.
- Put generic LinkedIn response helpers in `background/linkedin/`; keep endpoint-specific rules beside their endpoint feature.
- A function injected with `chrome.scripting.executeScript` must live in a clearly named module, remain self-contained, and document that imported runtime values are unavailable after serialization.
- Keep content/background message contracts explicit and typed. Avoid hidden DOM or storage side effects inside parsers and utilities.

### Required feature-first layout

New non-trivial code must be organized by feature ownership. Do not add more domain-prefixed production files to an already flat directory.

Use this structure for extension background work:

```text
extension/src/background/
  background.ts                    service-worker entrypoint and registration only

  runtime/                         Chrome lifecycle wiring
    register-alarms.ts
    register-message-handlers.ts
    register-tab-listeners.ts

  features/
    <feature>/
      api/                          external request orchestration
      parsers/                      pure payload parsing and model mapping
      services/                     domain operations and external I/O
      sync/                         coordinator, policy, runtime, and state
      storage/                      feature-owned persistence adapters
      messaging/                    typed Chrome message contracts and handlers
      testing/                      reusable test factories and fixtures
      __tests__/                    behavior-focused tests
      types.ts                      feature-local shared types
      constants.ts                 feature-local constants
      public.ts                     optional narrow cross-feature API

  platform/
    chrome/                         generic Chrome API adapters
    linkedin/                       generic LinkedIn transport and execution helpers

  shared/                           utilities reused by multiple background features
```

A feature should include only the folders it actually needs. Do not create empty folders or speculative abstraction layers.

Use this structure for content-script features:

```text
extension/src/content/<feature>/
  index.ts                          content-script bootstrap only
  components/                      feature UI
  controllers/                     DOM event and UI orchestration
  services/                        external I/O and background messaging
  parsers/                         pure DOM or response parsing
  logic/                           feature-specific pure behavior
  styles/                          feature-owned styles
  testing/                         reusable test factories and fixtures
  __tests__/                       behavior-focused tests
  types.ts
  constants.ts
```

### Entrypoints and registration

- `background.ts`, content-script entrypoints, pages, and application entrypoints only register and compose features.
- Entrypoints must not contain endpoint parsing, Firestore operations, substantial state transitions, or reusable domain behavior.
- Chrome listeners and alarms must delegate to named feature handlers.
- Registration must be explicit. Importing a feature module must not unexpectedly register listeners, patch browser APIs, start synchronization, or write storage.
- Prefer functions such as `registerFeatureMessages()` or `registerFeatureRuntime()` over import-time side effects.

### Feature boundaries

- A feature owns its API calls, parsing, state, storage rules, synchronization, tests, and feature-specific UI.
- One feature must not import another feature's internal parser, storage module, coordinator, or private types.
- When a cross-feature dependency is necessary, expose a small typed contract from `public.ts`. Do not re-export every internal module.
- Imports within one feature should remain direct. Do not create broad barrel files that hide dependencies or introduce circular imports.
- Cross-feature orchestration belongs at the runtime/application boundary, not inside either feature.
- Avoid generic event buses for simple sequencing. Prefer explicit calls between narrow typed public APIs.
- Platform adapters must not contain product-specific decisions.
- Pure parsers and utilities must not import Chrome APIs, Firebase, React, DOM mutation code, or feature coordinators.

### Ownership rules

Place code according to its narrowest real owner:

1. One feature consumer: keep it inside that feature.
2. Multiple features in one application: move it to that application's `shared/`.
3. Both extension and dashboard consumers: move it to root `shared/` only when it is platform-neutral.
4. Generic Chrome or LinkedIn transport behavior: place it under `platform/`.
5. Endpoint-specific LinkedIn behavior: keep it beside the feature using that endpoint.

Do not promote code because it might be reusable later. Promote it only after a second real consumer appears or when it is intrinsically generic.

### File naming and responsibility

Use capability-based names:

- `profile-viewer-parser.ts`
- `relationship-status-service.ts`
- `sync-policy.ts`
- `sync-state.ts`
- `message-handler.ts`
- `firestore-repository.ts`

Avoid catch-all names:

- `helpers.ts`
- `common.ts`
- `manager.ts`
- large generic `utils.ts`
- files containing unrelated feature prefixes

A file should normally belong to one category: entrypoint, component, controller, service, API adapter, parser, storage adapter, policy, state, or types. If a file contains several of these categories, split it.

### Tests and test support

- Keep tests beside the feature they protect.
- Do not add new domain tests to a global or root `__tests__/` directory.
- Name tests after behavior rather than implementation details.
- Shared test factories and fixtures belong in the feature's `testing/` directory.
- Production modules must never import from `testing/` or `__tests__/`.
- Split large test files by scenario or behavior when they become difficult to navigate.
- The number of tests is not a reason to merge or delete them.

### Incremental migration

Existing flat modules may remain until they are deliberately migrated.

- Do not perform a repository-wide move as part of an unrelated feature change.
- Do not add new files that continue an existing flat prefix pattern.
- When materially changing a flat feature, prefer moving that feature into its owned directory first or in a separate structural commit.
- Keep move-only refactors separate from behavior changes.
- Preserve public exports during migration with temporary compatibility re-exports when necessary.
- File moves must not rename storage keys, alarm names, message types, Firestore paths, persisted fields, or external request contracts.
- Remove compatibility re-exports only after all consumers have migrated.

### File responsibility and size

- One file should have one reason to change. Do not mix route composition, React components, hooks, network calls, payload parsing, and generic utilities in one file.
- Prefer one exported React component or hook per file. Related types and tiny private helpers may stay with it.
- Treat 250 lines as a review signal for production TypeScript/TSX and 350 lines as a strong split signal. Generated data, declarative styles, and tests may be longer when splitting would reduce clarity.
- If a file needs headings such as “components”, “API”, “parsing”, and “utilities”, those sections usually belong in separate modules.
- Avoid catch-all names such as `helpers.ts`, `common.ts`, or an ever-growing `utils.ts`. Name modules after the capability: `relative-time.ts`, `feed-reorder.ts`, `profile-viewer-parser.ts`.

### Reuse and exports

- Search before creating a utility or component. Reuse an existing implementation when its semantics match exactly.
- Extract shared behavior, not merely similar-looking code. Callers with different business rules should keep separate adapters over a small shared primitive.
- Prefer direct imports from the owning module. Add a barrel `index.ts` only for a stable public feature boundary; do not create barrels that introduce circular dependencies.
- Keep types close to their owner. Move a type to `shared/types.ts` only when both app surfaces persist or exchange that contract.
- Preserve compatibility when reorganizing a public module: re-export moved public symbols from the old facade when practical, then migrate consumers deliberately.

### Tests for reorganized code

- Pure parsers and transformations require focused unit tests when behavior changes.
- Keep feature tests beside the feature (`__tests__/`) and name them after behavior, not implementation details.
- A file move alone must preserve behavior. Separate structural refactors from product behavior changes where practical.

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

For architecture changes also verify:

- imports follow the dependency direction above
- no duplicate utility remains in the files touched by the change
- route pages and entrypoints contain composition rather than implementation details
- moved public exports and message contracts remain compatible

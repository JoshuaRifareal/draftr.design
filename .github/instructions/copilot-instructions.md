# Copilot / AI agent instructions for draftr.design

Purpose: give an AI coding agent the minimal, actionable context to be productive in this repo.

Confidence: 84%

1) Big picture
- Frontend (client/): React + TypeScript app built with Vite. Entry lives under `client/src` and assets under `client/public`.
- Engine (engine/): Rust crate compiled to WebAssembly. `engine/Cargo.toml` uses `wasm-bindgen` and produces a `cdylib` that is packaged into `client/src/pkg`.
- Integration: the frontend imports prebuilt wasm wrappers from `client/src/pkg` (e.g. `draftr_engine.js`, `draftr.js`). The runtime flow is UI -> AppStateStore -> Services (RenderService, LayerService, etc.) -> WASM engine where heavy computation/graphics occurs.

2) Key developer workflows
- Run frontend dev server (fast feedback):
  - cd into `client`, install deps and start Vite: `npm install` then `npm run dev` (server port configured to 3000 in `client/vite.config.ts`).
- Build frontend for production: from `client` run `npm run build` (Vite build; `base: './'` is important for SPA/static hosting).
- Rebuild Rust -> WASM (NOT scripted in repo): the repo stores prebuilt wasm in `client/src/pkg`. If you change Rust code, rebuild and overwrite `client/src/pkg` artifacts. Two common options:
  - wasm-pack (recommended if installed):
    - from `engine/` (exact command used in this project):
      - `wasm-pack build --target web --out-dir ../client/src/pkg --out-name draftr_engine --release`
  - cargo + wasm-bindgen (manual):
    - `cargo build --target wasm32-unknown-unknown --release`
    - `wasm-bindgen target/wasm32-unknown-unknown/release/draftr.wasm --out-dir ../client/src/pkg --target web`

3) Project-specific conventions & patterns (practical examples)
- AppStateStore is the single-source-of-truth for application state and implements undo/redo semantics. See `client/src/services/AppStateStore.ts`.
  - Always use `executeCommand(commandName, executeFn)` for state-mutating operations that should be undoable.
  - Use `updateTemporaryState(updates)` for visual/preview-only updates that must NOT be added to undo history.
  - Navigation actions are debounced and captured as a single history entry when their commandName includes any of: `zoom`, `pan`, `zoom-in`, `zoom-out`, `reset-zoom`.
  - Memory-management: the store estimates state size and trims history once estimated memory exceeds ~50MB (see `MEMORY_LIMIT_MB`). Keep undo snapshots small when possible.
  - Use `getUndoableState(state)` behavior as the canonical shape of what must be preserved for undo (it explicitly resets preview fields like `selectionStart`, `previewEnd`, and `vertexConstraints`).

- Debugging helpers: production of global debug handles is intentional. `AppStateStore` instance and helpers are exported on `window` for quick debugging:
  - `window.appStateStore`, `window.AppStateStore`, `window.createInitialState`, `window.testAppStateStore`.

4) Integration points & important files to reference
- Frontend build + config
  - `client/package.json` (scripts: `dev`, `build`)
  - `client/vite.config.ts` (base set to `./`, port 3000)

- Core state & services
  - `client/src/services/AppStateStore.ts` (undo/redo, navigation debounce, memory management)
  - `client/src/services/RenderService.ts`, `LayerService.ts`, `CommandAdapters.ts` (services folder coordinates rendering and command execution patterns)

- Wasm / engine
  - `engine/Cargo.toml` (crate uses `wasm-bindgen` and `cdylib` crate-type)
  - `client/src/pkg/` (prebuilt wasm artifacts and generated JS/type files; update this when engine changes)

5) PR / change guidance for agents
- If you modify Rust code, update `client/src/pkg` and commit the generated JS/TS and .wasm. If you cannot generate wasm in CI, clearly document the build step in the PR.
- Preserve `client/src/pkg/package.json` contents when updating artifacts; the frontend expects the same import surface.
- Small, focused PRs are preferred. When altering `AppStateStore` behavior, include a short runtime smoke test (manual steps) because no automated tests are present.

PR checklist (short):
- Describe the change and why it was needed.
- If engine/ changed: include the exact `wasm-pack` command used and the timestamped output.
- Run the `client` dev server and confirm the app loads and main UI renders (sanity check).
- For `AppStateStore` changes: include a manual checklist of undo/redo and selection transform scenarios you verified.

WASM rebuild checklist (copy into PR if applicable):
- From repository root run:
  - cd into engine: `cd engine`
  - build with wasm-pack (exact):
    - `wasm-pack build --target web --out-dir ../client/src/pkg --out-name draftr_engine --release`
  - Commit updated files under `client/src/pkg/` (JS, .d.ts, .wasm) with a clear commit message like `chore(wasm): rebuild draftr_engine @<date>`

6) What the agent should do first when making changes
- Read `client/src/services/AppStateStore.ts` to understand state mutation patterns.
- Search `client/src/pkg` imports to see which wasm bindings are used by the frontend.
- Run the frontend dev server locally (`client` scope) before changing UI code.

7) Missing / assumed items
- No test suite was detected under `client/` — treat state changes cautiously and provide a brief manual test checklist in PR descriptions.
 
---
## Project-specific Response & Implementation Guidelines
Below are the user's AI guidelines adapted into short, actionable rules for working in this repository. When you respond or propose code changes, follow these and include concrete, repo-specific examples.

Response guidelines (repo-specific)
- Always include a confidence level (e.g. `Confidence: 85%`). If unsure, list assumptions and the precise missing info (for example: CI can/can't build wasm).
- When uncertain about behavior or an API, ask 1–3 clarifying questions and suggest a safe default; e.g., "Should I rebuild wasm with wasm-pack and commit artifacts? If not, I'll only change TS files."
- Explain code snippets briefly and reference exact files/lines to change (example: update `executeCommand` usage in `client/src/services/SomeService.ts`).
- Prefer copy-paste ready code examples. When showing imports for wasm, verify exports in `client/src/pkg` first and use the actual symbol names.

Implementation strategy (repo-specific)
- Add acceptance tests for new features when possible. If no test infra exists, include a short manual acceptance checklist in the PR (see PR checklist earlier).
- Verify integration by running the `client` dev server and walking affected flows: selection, transforms, undo/redo, zoom/pan.
- Watch two hotspots: rendering performance (RenderService) and undo history memory (AppStateStore). If touching render loops, profile in the browser.
- Avoid unnecessary state updates: use `updateTemporaryState` for previews and `executeCommand(commandName, fn)` for undoable changes.
- Respect AppStateStore's navigation debounce for zoom/pan — don't add extra frequent history entries for navigation.

Coding guidelines (repo-specific)
- Keep code modular and typed. UI components go under `client/src/components/`; services under `client/src/services/`.
- Document non-obvious logic inline (e.g., why a field is excluded from undo snapshots in `getUndoableState`).
- When changing WASM bindings, include the exact `wasm-pack` command run and list the updated `client/src/pkg/*` files in the PR. The project's canonical command is:

```text
wasm-pack build --target web --out-dir ../client/src/pkg --out-name draftr_engine --release
```

- Example wasm import pattern (verify actual exports first):

```ts
import init, { someExport } from './pkg/draftr_engine.js';
await init();
// use someExport(...)
```

- Guard large data in undo snapshots: prefer trimming or shallow-copying large arrays of primitives when possible.
- Surface helpful dev logs consistent with existing patterns (see `console.log` usage in `AppStateStore.ts`).

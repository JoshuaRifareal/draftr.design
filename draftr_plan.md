
# Draftr — Development & Implementation Plan

> Note: This plan lists ordered steps and milestones. It avoids explicit calendar durations — use your project management tool to assign timeboxes.

## Phase 0 — Preparation & Research
- [ ] Recruit core team (roles): Product Manager, Frontend Engineer(s), Rust Engineer (WASM), Backend Engineer, UX/UI Designer, QA Engineer, DevOps
- [ ] Set up project repositories, initial branching strategy
- [ ] Define coding standards, linting, pre-commit hooks
- [ ] Create design system (Tailwind tokens, Radix components)
- [ ] Prototype critical UX flows (paper/figma): canvas, toolbars, layer panel, collaboration indicators

## Phase 1 — Core Client Skeleton + Auth + Storage
- Tasks:
  - Scaffold React + TypeScript application
  - Integrate auth (Supabase) and simple project listing UI
  - Create Postgres schema for users/projects/documents
  - S3 bucket setup & simple upload/download utility
  - Basic project & document CRUD (metadata only)
- Acceptance:
  - Users can login, create projects, upload/download document blobs

## Phase 2 — Engine Proto (Rust/WASM) + Simple Renderer
- Tasks:
  - Create minimal Rust crate for geometry primitives (Point, Line, Polyline, Transform)
  - Compile to WASM; load from React app
  - Implement WebGL canvas that renders simple vector primitives from WASM output
  - Wire up basic drawing interactions (line draw) via JS->WASM calls
- Acceptance:
  - Basic geometry is created in the editor and rendered; no collaboration yet

## Phase 3 — Collaboration Backbone (Y.js + WebSocket Session Server)
- Tasks:
  - Integrate Y.js on client; design the CRDT document shape
  - Implement Node.js WebSocket session server that relays updates and optionally holds in-memory state
  - Implement presence (user cursors)
  - Autosave hook: persist CRDT snapshot to S3 via server
- Acceptance:
  - Two users can edit the same document in real-time with visible cursors

## Phase 4 — Core Drawing Tools & UX Polishing
- Tasks:
  - Implement more drawing tools (polyline, arc, circle, rectangle)
  - Implement selection, transform, move/rotate/scale tools
  - Implement snapping (end, mid, intersection, perpendicular), grid system
  - Layer management UI
  - Undo/Redo integrated with CRDT operations
- Acceptance:
  - Users can create and modify drawings with snaps & layers; undo/redo works consistently

## Phase 5 — Import/Export + File Interop
- Tasks:
  - Implement DXF import/export (using or writing a parser)
  - Implement SVG import/export
  - Implement PDF export for print layouts
  - Add thumbnail generation on save
- Acceptance:
  - Documents can be imported/exported and open correctly in common tools (basic fidelity)

## Phase 6 — Advanced 2D Features
- Tasks:
  - Dimensions & annotation tools
  - Blocks/symbol library (doors, windows)
  - Parametric constraints framework (basic)
  - Scaled layout & print dialog
- Acceptance:
  - Professional drafting features usable by architects for typical floor plans

## Phase 7 — 3D Prototype & Geometry Bridge
- Tasks:
  - Add Three.js integration; create extrusion tools to convert 2D walls into 3D
  - Mesh boolean ops via Rust (WASM)
  - Export 3D glTF/OBJ
- Acceptance:
  - Basic 3D view from 2D drawings, exportable meshes

## Phase 8 — Hardening, Testing & Monitoring
- Tasks:
  - E2E tests for core flows (drawing, collaborating, importing/exporting)
  - Load tests for session server and renderer stress test
  - Security audits and dependency scanning
  - Implement monitoring (Sentry/Grafana) and set up alerts
- Acceptance:
  - Stable system under defined load targets; test suites passing in CI

## Phase 9 — Beta Release & Feedback Loop
- Tasks:
  - Invite closed beta testers (architect firms, students)
  - Collect feedback, crash reports, telemetry
  - Prioritize fixes and UX improvements
- Acceptance:
  - Beta cohort reports acceptable usability and bug threshold meets release criteria

## Phase 10 — GA Release & Post-Launch
- Tasks:
  - Final QA sweep; documentation complete
  - Marketing site and onboarding flows live
  - Support channels & SLAs configured
- Post-launch:
  - Feature analytics, monetization plans, enterprise features

---

# Testing Plan (detailed)

## Unit Testing
- **Frontend**: Jest + React Testing Library for components & utilities
- **Rust**: Built-in cargo test for geometry & algorithms

## Integration Testing
- API endpoints (Supertest) + DB fixtures
- CRDT snapshot save/load tests

## E2E Testing
- Playwright or Cypress to simulate:
  - Drawing sessions with multiple clients
  - Import/export flows
  - Authentication & permissions

## Performance Testing
- **Client-side**: profile rendering frame times, memory usage (Chrome devtools)
- **Server**: k6 load tests for WebSocket messaging & autosave throughput
- **Large files**: test with large DXF/SVG files for parsing & rendering

## Security Testing
- Snyk / Dependabot for dependency scanning
- OWASP top 10 checklist
- Penetration test prior to GA

---

# Implementation Checklist (Developer Tasks)

- Repo + initial scaffolding
- CI pipeline (lint/test/build)
- Auth integration + basic UI
- Rust/WASM prototype + renderer
- Y.js integration + WS server
- Core tools + snapping + layers
- Import/export pipelines
- E2E + load tests
- Monitoring + alerts
- Beta onboarding + docs


# Draftr — Project Specification

## 1. Project Overview
**Name:** Draftr  
**Type:** Web-based CAD app for architectural drawing (2D first, 3D later).  
**Vision:** A lightweight, high-performance browser CAD app combining AutoCAD-level precision with Figma/Rayon-like collaboration and responsiveness.

## 2. Target Users
- Professional architects & design firms
- Freelance architects and draftspeople
- Architectural students and educators
- Interior designers and space planners

## 3. Goals & Success Metrics
**Goals**
- Deliver a performant, accurate 2D drafting experience in the browser.
- Provide real-time collaboration with low latency.
- Be extensible to 3D and BIM-lite features.
- Keep the UI modern and accessible.

**Success Metrics**
- Initial load time <= target (fast perceived load).
- Rendering responsiveness: 60+ FPS for typical documents (editor target).
- Collaboration latency < 200ms for nearby regions (subject to infra).
- Basic DXF import/export fidelity >= acceptable threshold (no gross geometry loss).
- User satisfaction / NPS for early testers > benchmark.

> Note: exact numeric targets are for product team to define relative to infrastructure and testing baselines.

## 4. Scope — MVP (v1.0)
**Core Drawing Tools**
- Line, Polyline, Circle, Arc, Rectangle
- Text/Annotation
- Basic hatch patterns
- Offset, Trim, Extend, Move, Copy, Rotate, Scale

**Core UX**
- Layers (create/hide/lock)
- Grid & Snap (endpoint, midpoint, intersection, perpendicular, perpendicular, center)
- Zoom/Pan (smooth)
- Undo/Redo
- Selection: window, crossing, single

**Import/Export**
- Import: SVG, DXF (basic support)
- Export: SVG, PDF, DXF (basic)

**Collaboration**
- Real-time multi-user editing (Y.js CRDT over WebSockets)
- Live cursors + presence
- Autosave and cloud persistence
- Permissions: Owner, Editor, Viewer

**Persistence & Infra**
- Postgres for metadata (users, projects)
- S3-compatible object storage for file blobs
- Node.js session & project API

## 5. Future / Roadmap (post-MVP)
- Advanced 2D: Dimensions, Parametric constraints, Blocks/symbols, Scaled layouts & print
- 3D: 2D->3D extrusions, basic mesh ops, glTF export
- BIM-lite: IFC import/export, smart objects (walls, windows)
- Plugin API, Marketplace
- Advanced rendering: WebGPU, PBR materials, real-time shadows

## 6. Non-functional Requirements
- **Performance**: Core rendering engine via Rust→WASM + WebGL2
- **Scalability**: Session servers horizontally scalable; persistence to object storage
- **Security**: TLS everywhere, JWT-based auth, role-based access control
- **Reliability**: Autosave, version history, ability to recover from session failure
- **Maintainability**: Clear separation between UI (React) and engine (WASM)

## 7. Technical Architecture (High level)
- **Client**: React + TypeScript (UI) + Rust/WASM (rendering & geometry)
- **Realtime**: Y.js CRDT, WebSockets transport, in-memory session server (optionally Jamsocket)
- **Backend**: Node.js + TypeScript for APIs; PostgreSQL for metadata; S3 (R2) for blobs
- **3D**: Three.js for early 3D; Rust for mesh ops
- **CI/CD**: GitHub Actions; Vercel for frontend; cloud infra for backend

## 8. Data Models (Simplified)
- **User**: id, name, email, role, org_id, created_at
- **Project**: id, owner_id, name, description, permissions, created_at
- **Document**: id, project_id, blob_pointer (S3 key), metadata (layers, thumbnails)
- **Session**: session_id, document_id, participants[], memory_state_id
- **EventLog**: id, document_id, version, change_blob, timestamp, user_id

## 9. APIs (Representative)
- `POST /api/auth/login` -> auth (Supabase or custom)
- `GET /api/projects` -> list projects
- `POST /api/projects` -> create project
- `GET /api/documents/:id` -> fetch metadata & initial manifest
- `POST /api/documents/:id/save` -> persist blob to S3
- Realtime WebSocket endpoint: `wss://realtime.draftr.app/sync`

## 10. Security & Compliance
- TLS/HTTPS for all endpoints
- Encrypted-at-rest for object storage if required (SSE)
- Role-based access control and audit logging
- GDPR-compliant user data handling (if users in EU)
- Rate limits on public endpoints, account protections

## 11. Testing Strategy (overview)
- Unit tests: JS/TS + Rust unit tests
- Integration tests: API endpoints, DB interactions
- E2E tests: Playwright/Cypress for UI workflows (drawing, collaboration)
- Load/performance tests: simulate large docs and multi-user sessions (k6, Artillery)
- Security testing: SAST tools, dependency audits, pen tests before GA

## 12. Operational Considerations
- Monitoring: Sentry + Prometheus/Grafana
- Logging: Structured logs (JSON), central log aggregation
- Backups: DB daily snapshots, object storage lifecycle rules
- Rollback plan: Blue/green or canary releases for backend; static frontend with feature flags

## 13. Acceptance Criteria (v1.0)
- All core drawing tools work with expected precision
- Basic import/export functionality functional with no critical failures
- Real-time collaboration functioning for 2–4 concurrent users per document
- Autosave and document persistence working reliably
- CI pipeline with unit tests; basic E2E happy path tests

## 14. Risks & Mitigations
- **Risk**: WASM/Rust complexity slows development. → **Mitigation**: Build minimal geometry primitives in Rust; prototype in JS for faster iteration.
- **Risk**: CRDT integrations cause conflicts or scaling issues. → **Mitigation**: Start with Y.js and run early simulations; use in-memory session servers.
- **Risk**: Large DXF files performance. → **Mitigation**: Stream parsing, tile/render-level optimizations, spatial indexing.

## 15. Deliverables (Initial)
- v1.0 web client with core 2D tooling + collaboration
- API server + session server
- Documentation: developer README, deployment docs, user onboarding guide
- Test suite and CI pipeline


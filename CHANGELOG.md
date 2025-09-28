# Changelog

---

## Checkpoint #1 – Initial WASM + React Integration
- ✅ Project bootstrapped with **React + TypeScript + Vite** on Windows.  
- ✅ `wasm-pack` used to build **Rust → WebAssembly (WASM)** module.  
- ✅ Verified pipeline: Rust → JS glue → React integration.  
- ✅ Console logs **"Hello from Rust"** successfully.  
- ✅ **First line drawn** (black, via WebGL2).  

---

## Checkpoint #2 – Stable Single Red Line
- ✅ Clean file structure confirmed:
  - `client/index.html` as entry (not inside `public/`).
  - `main.tsx` bootstraps React.
  - `App.tsx` handles WebGL + WASM rendering logic.
  - `lib.rs` (Rust) defines `draw_line` returning `Float32Array`.
- ✅ Fixed duplicate line issue (now only one line is drawn).  
- ✅ Added debug logging (`draw_line returned …`, `Lines drawn: 1`).  
- ✅ Fragment shader updated → lines now render in **red**.  
- ✅ Confirmed **clean rendering pipeline**: one red line, no duplicates.  

---

## Checkpoint #3 – Line Tool Workflow
- ✅ Implemented **line-drawing workflow**:
  1. First click → set starting point.
  2. Mouse move → live preview of line.
  3. Second click → finalize line, auto-prepare next line (start = last endpoint).
  4. ESC → cancel current line & exit line-drawing mode.
  5. Right-click → same as ESC, context menu suppressed.
- ✅ Lines persist after drawing; **preview lines do not overwrite committed lines**.

---

## Checkpoint #4 – Vertex Snapping, World Coordinates, Zooming and Panning
- ✅ Added **soft snapping** to vertices of existing lines:
  - Visual **snap indicator** (red cross) shows when near vertex.
  - Snap threshold: (configurable via `SNAP_THRESHOLD`).
  - Snapping can be **enabled/disabled** (`snapConfig.enabled`).
- ✅ Preview line respects snapping; finalized lines use snapped positions if near.
- ✅ Hovering indicator only active in line-drawing mode.
- ✅ World coordinate system (supports scaling and offset)
- ✅ Zooming (centered on cursor, smooth and stable)
- ✅ Panning (middle mouse drag, 1:1 movement, no jumps)

---

## Checkpoint #5 – Advanced Snapping, Command System & Professional UI
- ✅ **Advanced Snapping System**:
  - **Orthogonal snapping** (F8 toggle) with configurable angles (0°, 45°, 90°, 135°)
  - **Constraint snapping** (F9 toggle) with visual guides and cross indicators
  - **Hysteresis behavior** for stable vertex snapping
  - **Priority system**: vertex > intersection > constraint > orthogonal
  - **Shift-key override** for temporary orthogonal mode

- ✅ **Professional Command System**:
  - **Command palette** (Ctrl+K) with fuzzy search and keyboard navigation
  - **Tool commands**: Selection, Line, Rectangle, Circle tools
  - **View commands**: Zoom in/out, reset zoom, clear canvas
  - **Edit commands**: Delete selected, toggle grid
  - **Smart undo/redo** with clean state management

- ✅ **Centralized State Management**:
  - **AppStateStore** with full undo/redo history
  - **CommandAdapters** bridge between commands and state
  - **Smart navigation capture** (debounced zoom/pan undo points)
  - **Visual indicators excluded** from undo history (preview lines, snap points)

- ✅ **Enhanced Rendering & UI**:
  - **Layer system** with hierarchy and inheritance
  - **Theme manager** with dark/light mode (F10 toggle)
  - **Professional UI overlay** with toolbars and panels
  - **Selection highlighting** with visual feedback
  - **Grid rendering** with theme-aware colors

- ✅ **Robust Architecture**:
  - **Clean separation** of concerns (services, components, types)
  - **Type-safe** throughout with TypeScript interfaces
  - **Performance optimized** rendering with WebGL
  - **Modular design** for easy feature extensions
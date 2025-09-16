# Changelog

---

## Checkpoint #1 – Initial WASM + React Integration
- ✅ Project bootstrapped with **React + TypeScript + Vite** on Windows.  
- ✅ `wasm-pack` used to build **Rust → WebAssembly (WASM)** module.  
- ✅ Verified pipeline: Rust → JS glue → React integration.  
- ✅ Console logs **“Hello from Rust”** successfully.  
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

## Checkpoint #3 – AutoCAD-Like Line Workflow
- ✅ Implemented **line drawing workflow**:
  1. First click → set start point.  
  2. Mouse move → live preview of line.  
  3. Second click → finalize line, auto-prepare next.  
  4. ESC → cancel preview & exit line-drawing mode.  
  5. Right-click → cancel preview & exit line-drawing mode.  
- ✅ Maintains **array of committed lines** (persist until cleared).  
- ✅ Preview line drawn separately, does not erase committed lines.  
- ✅ Redraw cycle optimized: committed lines + optional preview on each mouse move.  
- ✅ Confirmed **no dangling preview lines** after cancel.  

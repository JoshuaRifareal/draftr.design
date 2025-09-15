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

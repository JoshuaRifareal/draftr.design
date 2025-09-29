# Changelog

---

## Checkpoint #1 – Core Infrastructure
- ✅ **WebAssembly Integration**
  - Rust to WASM compilation pipeline
  - React + WebGL2 rendering foundation
  - Basic drawing primitive system

---

## Checkpoint #2 – Stable Rendering Pipeline
- ✅ **Graphics System**
  - Fixed rendering artifacts and duplicates
  - Consistent color and line rendering
  - Reliable WebGL draw calls
  - Proper cleanup and state management

---

## Checkpoint #3 – Drawing Tools Foundation
- ✅ **Line Tool Implementation**
  - Interactive click-to-draw workflow
  - Real-time preview during creation
  - Cancellation and continuous drawing modes
  - Basic tool state management

---

## Checkpoint #4 – Navigation & Precision
- ✅ **Viewport Control**
  - Smooth zoom and pan navigation
  - World coordinate system
  - Mouse-relative zoom centering

- ✅ **Snapping System**
  - Vertex snapping to existing geometry
  - Visual feedback for snap points
  - Configurable snap sensitivity

---

## Checkpoint #5 – Core Application Features
- ✅ **Advanced Snapping System**:
  - Orthogonal snapping (45° increments)
  - Constraint snapping with visual guides
  - **Hysteresis behavior** for stable vertex snapping
  - **Priority system**: vertex > intersection > constraint > orthogonal
  - Shift-key temporary orthogonal mode

- ✅ **State Management**:
  - Centralized AppStateStore with undo/redo
  - Command system for tool operations
  - Smart state capture for navigation commands

- ✅ **UI & Interaction**:
  - Theme system (dark/light mode)
  - Custom cursors with theme support
  - Layer panel with primitive organization
  - Tool selection interface

- ✅ **Rendering**:
  - Selection highlighting
  - Grid display with theme colors
  - Visual feedback for snapping and constraints

---

## Checkpoint #6 – Layer System
- ✅ **Architecture and Management**:
  - Hierarchical layer structure with parent-child relationships
  - Orphaned primitives support for unassigned geometry
  - Layer properties inheritance (visibility, locking, color)
  - Active layer system for primitive assignment and reassignment

- ✅ **Visual Organization**:
  - Layer panel React component
  - Primitive assignment tracking per layer
  - Active layer indication
  - Real-time synchronization between canvas and layer panel
  - Theme-aware rendering for layer-specific colors
  - Selection highlighting that respects layer visibility
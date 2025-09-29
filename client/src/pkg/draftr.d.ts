/* tslint:disable */
/* eslint-disable */
export class Renderer {
  free(): void;
  constructor(canvas: HTMLCanvasElement);
  setOrthoColor(r: number, g: number, b: number, a: number): void;
  setOrthoDash(dash_px: number, gap_px: number): void;
  setOrthoThickness(thickness_px: number): void;
  setOrthoThresholdDeg(deg: number): void;
  setGridColor(r: number, g: number, b: number, a: number): void;
  setGridSpacing(min_px: number, max_px: number): void;
  setCanvasColor(r: number, g: number, b: number, a: number): void;
  setSelectionColor(r: number, g: number, b: number, a: number): void;
  /**
   * Add or replace allowed orthogonal angles (in degrees).
   */
  setOrthoAngles(arr: Float32Array): void;
  /**
   * Resize viewport (call when canvas size changes)
   */
  resize(width: number, height: number): void;
  /**
   * Draw a line
   */
  draw_line(x1: number, y1: number, x2: number, y2: number, r: number, g: number, b: number, a: number): void;
  /**
   * Draw a circle (doubles as snap indicator)
   */
  draw_circle(cx: number, cy: number, radius: number, r: number, g: number, b: number, a: number, segments: number, screen_space: boolean): void;
  /**
   * Draw a rectangle
   */
  draw_rectangle(x1: number, y1: number, x2: number, y2: number, r: number, g: number, b: number, a: number, filled: boolean): void;
  /**
   * Draw a selection rectangle
   */
  draw_selection_rectangle(x1: number, y1: number, x2: number, y2: number): void;
  /**
   * Draw a cross indicator
   */
  draw_cross(cx: number, cy: number, size_px: number, r: number, g: number, b: number, a: number): void;
  /**
   * Draw a constraint guide (horizontal or vertical dashed line)
   */
  draw_constraint_guide(cx: number, cy: number, is_horizontal: boolean, r: number, g: number, b: number, a: number): void;
  /**
   * points_with_color is now [x,y,r,g,b,a, x,y,r,g,b,a, ...]
   * Returns a Float32Array copy of input (compat with previous API)
   */
  draw_lines(points_with_color: Float32Array): Float32Array;
  clear(): void;
  /**
   * Draw an adaptive grid
   */
  draw_grid(offset_x: number, offset_y: number, scale: number): void;
  /**
   * Draw an orthogonal guide as dashed line across the canvas.
   * - cx,cy: world coordinates where the guide should intersect (usually cursor or preview point)
   * - angle_rad: direction of the line in radians (0 = horizontal to the right)
   * Dash and gap lengths are specified in screen pixels (converted to world units using current scale).
   */
  drawOrthoGuide(cx: number, cy: number, angle_rad: number): void;
  offset_x: number;
  offset_y: number;
  scale: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_renderer_free: (a: number, b: number) => void;
  readonly __wbg_get_renderer_offset_x: (a: number) => number;
  readonly __wbg_set_renderer_offset_x: (a: number, b: number) => void;
  readonly __wbg_get_renderer_offset_y: (a: number) => number;
  readonly __wbg_set_renderer_offset_y: (a: number, b: number) => void;
  readonly __wbg_get_renderer_scale: (a: number) => number;
  readonly __wbg_set_renderer_scale: (a: number, b: number) => void;
  readonly renderer_new: (a: any) => number;
  readonly renderer_setOrthoColor: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly renderer_setOrthoDash: (a: number, b: number, c: number) => void;
  readonly renderer_setOrthoThickness: (a: number, b: number) => void;
  readonly renderer_setOrthoThresholdDeg: (a: number, b: number) => void;
  readonly renderer_setGridColor: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly renderer_setGridSpacing: (a: number, b: number, c: number) => void;
  readonly renderer_setCanvasColor: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly renderer_setSelectionColor: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly renderer_setOrthoAngles: (a: number, b: any) => void;
  readonly renderer_resize: (a: number, b: number, c: number) => void;
  readonly renderer_draw_line: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
  readonly renderer_draw_circle: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
  readonly renderer_draw_rectangle: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
  readonly renderer_draw_selection_rectangle: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly renderer_draw_cross: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly renderer_draw_constraint_guide: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly renderer_draw_lines: (a: number, b: number, c: number) => any;
  readonly renderer_clear: (a: number) => void;
  readonly renderer_draw_grid: (a: number, b: number, c: number, d: number) => void;
  readonly renderer_drawOrthoGuide: (a: number, b: number, c: number, d: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_1: WebAssembly.Table;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

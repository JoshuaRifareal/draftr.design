// Handle all rendering and drawing methods
// 1. Draw lines, rectangles, and use other tools
// 2. Orthogonal and constraint guides snapping
// 3. Pan/zoom functionality

import { Renderer } from "../pkg/draftr_engine.js";

export interface OrthoConfig {
  color: { r: number; g: number; b: number; a: number };
  dashPx: number;
  gapPx: number;
  thicknessPx: number;
  thresholdDeg: number;
  anglesDeg: number[];
}

export interface GridConfig {
  color: { r: number; g: number; b: number; a: number };
  spacingMin: number;
  spacingMax: number;
}

export class RenderService {
  private renderer: Renderer;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
  }

  // Transform methods
  setTransform(offsetX: number, offsetY: number, scale: number): void {
    this.renderer.offset_x = offsetX;
    this.renderer.offset_y = offsetY;
    this.renderer.scale = scale;
  }

  // Resize method
  resize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }

  // Drawing methods (direct 1:1 mapping)
  clear(): void {
    this.renderer.clear();
  }
  drawLine(x1: number, y1: number, x2: number, y2: number, r: number, g: number, b: number, a: number): void {
    this.renderer.draw_line(x1, y1, x2, y2, r, g, b, a);
  }
  drawCircle(cx: number, cy: number, radius: number, r: number, g: number, b: number, a: number, segments: number = 16, screenSpace: boolean = false): void {
    this.renderer.draw_circle(cx, cy, radius, r, g, b, a, segments, screenSpace);
  }
  drawRectangle(x1: number, y1: number, x2: number, y2: number, r: number, g: number, b: number, a: number, filled: boolean): void {
    this.renderer.draw_rectangle(x1, y1, x2, y2, r, g, b, a, filled);
  }
  drawSelectionRectangle(x1: number, y1: number, x2: number, y2: number): void {
    this.renderer.draw_selection_rectangle(x1, y1, x2, y2);
  }
  drawCross(cx: number, cy: number, sizePx: number, r: number, g: number, b: number, a: number): void {
    this.renderer.draw_cross(cx, cy, sizePx, r, g, b, a);
  }
  drawConstraintGuide(cx: number, cy: number, isHorizontal: boolean, r: number, g: number, b: number, a: number): void {
    (this.renderer as any).draw_constraint_guide(cx, cy, isHorizontal, r, g, b, a);
  }
  drawOrthoGuide(cx: number, cy: number, angleRad: number): void {
    this.renderer.drawOrthoGuide(cx, cy, angleRad);
  }
  drawGrid(offsetX: number, offsetY: number, scale: number): void {
    this.renderer.draw_grid(offsetX, offsetY, scale);
  }

  // Configuration methods
  setOrthoConfig(config: OrthoConfig): void {
    this.renderer.setOrthoColor(config.color.r, config.color.g, config.color.b, config.color.a);
    this.renderer.setOrthoDash(config.dashPx, config.gapPx);
    this.renderer.setOrthoThickness(config.thicknessPx);
    this.renderer.setOrthoThresholdDeg(config.thresholdDeg);
    this.renderer.setOrthoAngles(new Float32Array(config.anglesDeg));
  }
  setGridConfig(config: GridConfig): void {
    this.renderer.setGridColor(config.color.r, config.color.g, config.color.b, config.color.a);
    this.renderer.setGridSpacing(config.spacingMin, config.spacingMax);
  }
  setCanvasColor(r: number, g: number, b: number, a: number): void {
    this.renderer.setCanvasColor(r, g, b, a);
  }
  setSelectionColor(r: number, g: number, b: number, a: number): void {
    this.renderer.setSelectionColor(r, g, b, a);
  }


  getNativeRenderer(): Renderer {
    return this.renderer;
  }
}
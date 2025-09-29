// Handle all rendering and drawing methods
// 1. Draw lines, rectangles, and use other tools
// 2. Orthogonal and constraint guides snapping
// 3. Pan/zoom functionality

import { Renderer } from "../pkg/draftr_engine.js";
import { layerService, type Layer } from './LayerService';
import { selectionService, type Primitive } from './SelectionService';


const CROSS_INDICATOR_SIZE = 10; // px
const SNAP_INDICATOR_RADIUS = 4; // px


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

export interface RedrawParams {
  offsetX: number;
  offsetY: number;
  scale: number;
  activeTool: string;
  activeConstraint: any;
  constraintColor: any;
  currentStart: any;
  orthoConfig: any;
  vertexConstraints: any[];
  selectedPrimitiveIds: string[];
  selectionStart: any;
  selectionEnd: any;
  lineColor: any;
  snapColor: any;
  orthoThresholdDeg: number;
  orthoAnglesDeg: number[];
}

export class RenderService {
  private renderer: Renderer;
  private selectionHighlightColor = { r: 0.53, g: 0.81, b: 0.98, a: 1.0 }; // Default
  private selectionHandleColor = { r: 0.53, g: 0.81, b: 0.98, a: 1.0 };    // Default

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
  }

  setSelectionHighlightColor(color: { r: number; g: number; b: number; a: number }): void {
    this.selectionHighlightColor = color;
  }
  setSelectionHandleColor(color: { r: number; g: number; b: number; a: number }): void {
    this.selectionHandleColor = color;
  }

  // Drawing Primitives
  drawLine(x1: number, y1: number, x2: number, y2: number, r: number, g: number, b: number, a: number): void {
    this.renderer.draw_line(x1, y1, x2, y2, r, g, b, a);
  }
  drawCircle(cx: number, cy: number, radius: number, r: number, g: number, b: number, a: number, segments: number = 16, screenSpace: boolean = false): void {
    this.renderer.draw_circle(cx, cy, radius, r, g, b, a, segments, screenSpace);
  }
  drawRectangle(x1: number, y1: number, x2: number, y2: number, r: number, g: number, b: number, a: number, filled: boolean): void {
    this.renderer.draw_rectangle(x1, y1, x2, y2, r, g, b, a, filled);
  }
  drawAllPrimitives(): void {
    const allPrimitives = selectionService.getAllPrimitives();
  
    // Group primitives by layer for efficient rendering
    const primitivesByLayer = this.groupPrimitivesByLayer(allPrimitives);
    
    // Render layers in hierarchy order
    const layersInRenderOrder = this.getLayersInRenderOrder();
    
    // Render orphaned primitives first (or last, depending on desired z-order)
    const orphanedPrimitives = primitivesByLayer.get('__orphaned__') || [];
    if (orphanedPrimitives.length > 0) {
      this.drawOrphanedPrimitives(orphanedPrimitives);
    }
    
    // Then render layered primitives
    layersInRenderOrder.forEach(layer => {
      if (!layer.properties.visible) return;
      
      const layerPrimitives = primitivesByLayer.get(layer.id) || [];
      this.drawPrimitivesWithLayerProperties(layerPrimitives, layer);
    });
  }
  private drawOrphanedPrimitives(primitives: Primitive[]): void {
    primitives.forEach(primitive => {
      // Use default color for orphaned primitives
      const realColor = { r: 0.0, g: 0.0, b: 0.0, a: 1.0 };
      
      // Apply theme transformation if needed
      let finalColor = realColor;
      if (typeof window !== 'undefined' && (window as any).themeManager) {
        const themeManager = (window as any).themeManager;
        finalColor = themeManager.getRepresentationColor(realColor);
      } else {
        // Fallback: simple inversion (same as layered primitives fallback)
        const isDarkTheme = true; // Default to dark
        if (isDarkTheme && realColor.r === 0 && realColor.g === 0 && realColor.b === 0) {
          finalColor = { r: 1.0, g: 1.0, b: 1.0, a: realColor.a };
        }
      }
      
      switch (primitive.type) {
        case 'line':
          const [x1, y1, x2, y2] = primitive.data;
          this.drawLine(x1, y1, x2, y2, 
            finalColor.r, finalColor.g, finalColor.b, finalColor.a);
        break;
        case 'rectangle':
          // Future: rectangle rendering
          const [rectX1, rectY1, rectX2, rectY2, rectR, rectG, rectB, rectA] = primitive.data;
          this.drawRectangle(rectX1, rectY1, rectX2, rectY2,
            finalColor.r, finalColor.g, finalColor.b, finalColor.a, false);
        break;
        // Future: other primitive types
      }
    });
  }
  redrawAll(preview: { x: number; y: number } | null, snapResult: any, params: RedrawParams): void {
    if (!this.renderer) return;
    
    const {
        offsetX, offsetY, scale,
        activeTool, activeConstraint, constraintColor,
        currentStart, orthoConfig, vertexConstraints,
        selectedPrimitiveIds, selectionStart, selectionEnd,
        lineColor, snapColor, orthoThresholdDeg, orthoAnglesDeg
    } = params;
    
    this.setTransform(offsetX, offsetY, scale);
    this.clear();
    this.drawGrid(offsetX, offsetY, scale);

    // Draw constraint guides first (behind everything)
    if (activeTool !== 'SELECTION' && activeConstraint) {
      this.drawConstraintGuide(
        activeConstraint.x, 
        activeConstraint.y, 
        activeConstraint.type === 'horizontal',
        constraintColor.r, constraintColor.g, constraintColor.b, constraintColor.a
      );
    }
      
    // Draw orthogonal guides next
    if (currentStart && preview) {
      const guidePreview = snapResult.type === 'intersection' ? snapResult.position : preview;
      const nearest = this.nearestOrthoAngleDeg(currentStart, guidePreview, orthoAnglesDeg);
      
      if (nearest.diff <= orthoThresholdDeg) {
        const rad = (nearest.angle * Math.PI) / 180;
        this.drawOrthoGuide(currentStart.x, currentStart.y, rad);
      }
    }

    // Enhanced: Use layer-aware drawing
    this.drawAllPrimitives();

    // Draw selection highlights on top
    const selectedPrimitives = selectionService.getPrimitivesByIds(selectedPrimitiveIds);
    this.drawSelections(selectedPrimitives);

    // Draw selection rectangle if in selection mode
    if (activeTool === 'SELECTION' && selectionStart && selectionEnd) {
      this.drawSelectionRectangle(
        selectionStart.x, 
        selectionStart.y, 
        selectionEnd.x, 
        selectionEnd.y
      );
    }

    // Draw preview line (always on top, not affected by layers)
    if (currentStart && preview) {
      this.drawLine(currentStart.x, currentStart.y, preview.x, preview.y, 
        lineColor.r, lineColor.g, lineColor.b, lineColor.a);
    }

    // Draw cross indicators for vertex constraints
    if (activeTool !== 'SELECTION') {
      for (const constraint of vertexConstraints) {
        this.drawCross(
          constraint.x, 
          constraint.y, 
          CROSS_INDICATOR_SIZE,
          snapColor.r, snapColor.g, snapColor.b, snapColor.a
        );
      }
  }

    // Draw snap indicators (always on top)
    if (snapResult.type !== 'none') {
      switch (snapResult.type) {
        case 'vertex':
          this.drawCircle(
            snapResult.position.x, 
            snapResult.position.y, 
            SNAP_INDICATOR_RADIUS, 
            snapColor.r, snapColor.g, snapColor.b, snapColor.a,
            16, 
            true
          );
        break;
        case 'intersection':
          this.drawCross(
            snapResult.position.x, 
            snapResult.position.y,  
            CROSS_INDICATOR_SIZE,
            snapColor.r, snapColor.g, snapColor.b, snapColor.a
          );
        break;
      }
    }
  }

  // Draw UX graphics
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
  drawSelectionHighlight(primitive: any, isSelected: boolean): void {
    if (!isSelected) return;
  
    // Different highlight based on primitive type
    switch (primitive.type) {
      case 'line':
        this.drawLineSelection(primitive.data);
        break;
      // Future: rectangle and circle selection highlights
    }
  }
  drawSelections(selectedPrimitives: Primitive[]): void {
    selectedPrimitives.forEach(primitive => {
      // Check if primitive's layer allows selection highlighting
      if (primitive.layerId) {
        const layer = layerService.getLayer(primitive.layerId);
        if (layer && !layer.properties.visible) {
          return; // Don't highlight hidden layer primitives
        }
      }
      
      this.drawSelectionHighlight(primitive, true);
    });
  }
  
  // Helper methods
  private drawLineSelection(lineData: number[]): void {
    const [x1, y1, x2, y2] = lineData;
    
    // Use theme-aware colors
    const highlightColor = this.selectionHighlightColor;
    const handleColor = this.selectionHandleColor;

    // Draw line in selection color (light blue)
    this.drawLine(x1, y1, x2, y2, 
      highlightColor.r, highlightColor.g, 
      highlightColor.b, highlightColor.a);
    
    // Draw endpoint handles
    const handleRadius = SNAP_INDICATOR_RADIUS;
    this.drawCircle(x1, y1, handleRadius, 
      handleColor.r, handleColor.g, 
      handleColor.b, handleColor.a, 16, true);
    this.drawCircle(x2, y2, handleRadius, 
      handleColor.r, handleColor.g, 
      handleColor.b, handleColor.a, 16, true);
  }
  private groupPrimitivesByLayer(primitives: Primitive[]): Map<string, Primitive[]> {
    const grouped = new Map<string, Primitive[]>();
  
    primitives.forEach(primitive => {
      if (primitive.layerId) {
        const layerPrimitives = grouped.get(primitive.layerId) || [];
        layerPrimitives.push(primitive);
        grouped.set(primitive.layerId, layerPrimitives);
      } else {
        // Ensure orphaned primitives are rendered
        // Use a special key for orphaned primitives
        const orphanedKey = '__orphaned__';
        const orphanedPrimitives = grouped.get(orphanedKey) || [];
        orphanedPrimitives.push(primitive);
        grouped.set(orphanedKey, orphanedPrimitives);
      }
    });
    
    return grouped;
  }
  private getLayersInRenderOrder(): Layer[] {
    const allLayers = layerService.getAllLayers();
    const renderOrder: Layer[] = [];
    
    // First pass: root layers (no parent)
    const rootLayers = allLayers.filter(layer => !layer.parentId);
    renderOrder.push(...rootLayers);
    
    // Second pass: child layers (breadth-first)
    const processChildren = (parent: Layer) => {
      parent.children.forEach(child => {
        renderOrder.push(child);
        processChildren(child); // Recursive for nested children
      });
    };
    
    rootLayers.forEach(processChildren);
    
    return renderOrder;
  }
  private drawPrimitivesWithLayerProperties(primitives: Primitive[], layer: Layer): void {
    const effectiveProperties = layerService.getEffectiveProperties(layer.id);
    
    primitives.forEach(primitive => {
      const realColor = effectiveProperties.color || { r: 0.0, g: 0.0, b: 0.0, a: 1.0 };
      let finalColor = realColor;

      // Use themeManager if available
      if (typeof window !== 'undefined' && (window as any).themeManager) {
        const themeManager = (window as any).themeManager;
        finalColor = themeManager.getRepresentationColor(realColor);
      } else {
        // Fallback: simple inversion
        const isDarkTheme = true; // Default to dark
        if (isDarkTheme && realColor.r === 0 && realColor.g === 0 && realColor.b === 0) {
          finalColor = { r: 1.0, g: 1.0, b: 1.0, a: realColor.a };
        }
      }

      const opacity = effectiveProperties.opacity ?? 1.0;
      finalColor.a *= opacity;
      
      switch (primitive.type) {
        case 'line':
          const [x1, y1, x2, y2] = primitive.data;
          this.drawLine(x1, y1, x2, y2, finalColor.r, finalColor.g, finalColor.b, finalColor.a);
        break;
        // Future: rectangle, circle, etc.
      }
    });
  }
  private nearestOrthoAngleDeg(start: { x: number; y: number }, cursorWorld: { x: number; y: number }, orthoAnglesDeg: number[]): { angle: number; base: number; diff: number } {
    const dx = cursorWorld.x - start.x;
    const dy = cursorWorld.y - start.y;
    const angleRad = Math.atan2(dy, dx);
    let angleDeg = (angleRad * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;

    let bestCandidate = orthoAnglesDeg[0];
    let bestBase = orthoAnglesDeg[0];
    let bestDiff = 360;

    for (const base of orthoAnglesDeg) {
        const candA = ((base % 360) + 360) % 360;
        const candB = ((base + 180.0) % 360.0 + 360.0) % 360.0;

        const dA = Math.abs(((angleDeg - candA + 540) % 360) - 180);
        const dB = Math.abs(((angleDeg - candB + 540) % 360) - 180);

        if (dA < bestDiff) {
            bestDiff = dA;
            bestCandidate = candA;
            bestBase = base;
        }
        if (dB < bestDiff) {
            bestDiff = dB;
            bestCandidate = candB;
            bestBase = base;
        }
    }

    return { angle: bestCandidate, base: bestBase, diff: bestDiff };
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
  setTransform(offsetX: number, offsetY: number, scale: number): void {
    this.renderer.offset_x = offsetX;
    this.renderer.offset_y = offsetY;
    this.renderer.scale = scale;
  }
  resize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }
  clear(): void {
    this.renderer.clear();
  }

}
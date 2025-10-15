// Handle all rendering and drawing methods
// 1. Draw lines, rectangles, and use other tools
// 2. Orthogonal and constraint guides snapping
// 3. Pan/zoom functionality

import { Renderer } from "../pkg/draftr_engine";
import { layerService, type Layer } from './LayerService';
import { selectionService, type Primitive } from './SelectionService';
import { type Bounds } from '../types/ToolTypes';
import type { DrawingPrimitive } from '../types/DraftrTypes';
import type { Point } from '../types/ToolTypes';


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
  primitives: DrawingPrimitive[];
  transformPreview?: {
    active: boolean;
    mode: 'move' | 'scale' | 'rotate' | null;
    targetIds: string[];
    basePoint: Point | null;
    previewPoint: Point | null;
    originalPrimitives: DrawingPrimitive[];
    previewPrimitives: DrawingPrimitive[];
  };
}

export class RenderService {
  private renderer: Renderer;
  private canvas: HTMLCanvasElement;
  private selectionHighlightColor = { r: 0.22, g: 0.58, b: 1.0, a: 1.0 }; // Default
  private selectionHandleColor = { r: 0.22, g: 0.58, b: 1.0, a: 1.0 };    // Default
  private readonly LOD_THRESHOLD = 0.15; /* <--- Zoom level */

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.canvas = canvas;
  }

  // Selection highlighting
  setSelectionHighlightColor(color: { r: number; g: number; b: number; a: number }): void {
    this.selectionHighlightColor = color;
  }
  setSelectionHandleColor(color: { r: number; g: number; b: number; a: number }): void {
    this.selectionHandleColor = color;
  }

  // Viewport culling helper methods
  private getViewportBounds(offsetX: number, offsetY: number, scale: number): Bounds {
    // Calculate viewport bounds in world coordinates
    const width = this.canvas.width / scale;
    const height = this.canvas.height / scale;
    
    // 🎯 FIX: Use dynamic padding based on zoom level
    // At normal zoom: no padding, at very low zoom: small padding
    const minPadding = 0.1; // 10% padding at normal zoom
    const maxPadding = 0.3; // 30% padding at very low zoom
    const paddingFactor = Math.max(minPadding, Math.min(maxPadding, 0.3 - scale));
    
    const paddedWidth = width * (1 + paddingFactor);
    const paddedHeight = height * (1 + paddingFactor);
    
    const centerX = -offsetX + width / 2;
    const centerY = -offsetY + height / 2;
    
    return {
      left: centerX - paddedWidth / 2,
      right: centerX + paddedWidth / 2,
      top: centerY - paddedHeight / 2, 
      bottom: centerY + paddedHeight / 2
    };
  }
  private boundsIntersect(a: Bounds, b: Bounds): boolean {
    return !(a.right < b.left || 
             a.left > b.right || 
             a.bottom < b.top || 
             a.top > b.bottom);
  }
  private getPrimitiveBounds(primitive: Primitive): Bounds {
    switch (primitive.type) {
      case 'line':
        const [x1, y1, x2, y2] = primitive.data;
        return {
          left: Math.min(x1, x2),
          right: Math.max(x1, x2),
          top: Math.min(y1, y2),
          bottom: Math.max(y1, y2)
        };
      case 'rectangle':
        const [rectX1, rectY1, rectX2, rectY2] = primitive.data;
        return {
          left: Math.min(rectX1, rectX2),
          right: Math.max(rectX1, rectX2),
          top: Math.min(rectY1, rectY2),
          bottom: Math.max(rectY1, rectY2)
        };
      default:
        // For unknown types, assume they're visible (safe fallback)
        return { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity };
    }
  }
  private shouldRenderPrimitive(primitive: Primitive, viewportBounds: Bounds): boolean {
    const primitiveBounds = this.getPrimitiveBounds(primitive);
    return this.boundsIntersect(primitiveBounds, viewportBounds);
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
  drawAllPrimitives(offsetX: number, offsetY: number, scale: number): void {
    const allPrimitives = selectionService.getAllPrimitives();
    const viewportBounds = this.getViewportBounds(offsetX, offsetY, scale);
    
    // 🎯 FIX: Only filter by VISIBILITY, locked primitives should still be drawn
    const visiblePrimitives = allPrimitives.filter(primitive => {
      if (!primitive.layerId) return true; // Orphaned primitives (shouldn't exist anymore)
      
      const layer = layerService.getLayer(primitive.layerId);
      if (!layer) return false;
      
      // 🎯 FIX: Only skip if HIDDEN, locked layers should still be visible
      const effectiveProps = layerService.getEffectiveProperties(primitive.layerId);
      if (!effectiveProps.visible) {
        return false;
      }
      
      return this.shouldRenderPrimitive(primitive, viewportBounds);
    });

    // 🎯 LOD: Decide whether to use simplified rendering
    const useLOD = scale < this.LOD_THRESHOLD;
    
    // Group primitives by layer for efficient rendering
    const primitivesByLayer = this.groupPrimitivesByLayer(visiblePrimitives);
    const filteredPrimitivesByLayer = new Map<string, Primitive[]>();
    
    let visiblePrimitiveCount = 0;
    const totalPrimitiveCount = allPrimitives.length;
    
    primitivesByLayer.forEach((primitives, layerId) => {
      const visiblePrimitives = primitives.filter(primitive => 
        this.shouldRenderPrimitive(primitive, viewportBounds)
      );
      visiblePrimitiveCount += visiblePrimitives.length;
      
      if (visiblePrimitives.length > 0) {
        filteredPrimitivesByLayer.set(layerId, visiblePrimitives);
      }
    });
    
    // Calculate visible percentage for adaptive LOD
    const visiblePercentage = totalPrimitiveCount > 0 ? 
      Math.round((visiblePrimitiveCount / totalPrimitiveCount) * 100) : 0;
    
    // 🎯 DEBUG: Log rendering stats
    if (totalPrimitiveCount > 200 && useLOD) {
      console.log(`🎯 LOD + Culling: ${visiblePrimitiveCount}/${totalPrimitiveCount} primitives (${visiblePercentage}% visible)`);
    }
    
    // Render layers
    const layersInRenderOrder = this.getLayersInRenderOrder();
    
    // Render orphaned primitives
    const orphanedPrimitives = filteredPrimitivesByLayer.get('__orphaned__') || [];
    if (orphanedPrimitives.length > 0) {
      if (useLOD) {
        this.drawAdaptiveLODPrimitives(orphanedPrimitives, offsetX, offsetY, scale, visiblePercentage);
      } else {
        this.drawOrphanedPrimitives(orphanedPrimitives);
      }
    }
    
    // Render layered primitives
    layersInRenderOrder.forEach(layer => {
      if (!layer.properties.visible) return;
      
      const layerPrimitives = filteredPrimitivesByLayer.get(layer.id) || [];
      if (layerPrimitives.length > 0) {
        if (useLOD) {
          this.drawAdaptiveLODPrimitives(layerPrimitives, offsetX, offsetY, scale, visiblePercentage);
        } else {
          this.drawPrimitivesWithLayerProperties(layerPrimitives, layer);
        }
      }
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
          const [rectX1, rectY1, rectX2, rectY2] = primitive.data;
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
      currentStart, vertexConstraints,
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
    if ((currentStart && preview) || (params.transformPreview?.active && params.transformPreview.basePoint && params.transformPreview.previewPoint)) {
      let guideStart: Point;
      let guideEnd: Point;
      
      if (params.transformPreview?.active && params.transformPreview.basePoint && params.transformPreview.previewPoint) {
        // 🎯 TRANSFORM MODE: Use transform preview points
        guideStart = params.transformPreview.basePoint;
        guideEnd = params.transformPreview.previewPoint;
      } else {
        // 🎯 DRAWING MODE: Use currentStart and preview
        guideStart = currentStart!;
        guideEnd = snapResult.type === 'intersection' ? snapResult.position : preview!;
      }
      
      const nearest = this.nearestOrthoAngleDeg(guideStart, guideEnd, orthoAnglesDeg);
      
      if (nearest.diff <= orthoThresholdDeg) {
        const rad = (nearest.angle * Math.PI) / 180;
        this.drawOrthoGuide(guideStart.x, guideStart.y, rad);
      }
    }

    // Enhanced: Use layer-aware drawing
    this.drawAllPrimitives(offsetX, offsetY, scale);

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

    // Draw transform preview if active
    if (params.transformPreview?.active) {
      this.drawTransformPreview(params.transformPreview);
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
  private drawTransformPreview(transformPreview: RedrawParams['transformPreview']) {
    if (!transformPreview) return;
    
    // Draw base point
    if (transformPreview.basePoint) {
      this.drawCross(
          transformPreview.basePoint.x, 
          transformPreview.basePoint.y, 
          CROSS_INDICATOR_SIZE,
          1, 1, 1, 1
        );
    }
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
        case 'rectangle':
          const [rectX1, rectY1, rectX2, rectY2] = primitive.data;
          this.drawRectangle(rectX1, rectY1, rectX2, rectY2, 
            finalColor.r, finalColor.g, finalColor.b, finalColor.a, false);
          break;
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



  // LOD System
  private drawAdaptiveLODPrimitives(primitives: Primitive[], offsetX: number, offsetY: number, scale: number, visiblePercentage: number): void {
    // 🎯 Dynamic quality settings based on density
    let qualitySettings: {
      minPixelSize: number;
      pointAlpha: number;
      lineAlpha: number;
      circleSegments: number;
    };

    if (visiblePercentage > 60) {
      // 🚀 HIGH DENSITY: Very aggressive optimization
      qualitySettings = {
        minPixelSize: 12.0,
        pointAlpha: 0.3,
        lineAlpha: 0.3,
        circleSegments: 1
      };
    } else if (visiblePercentage > 30) {
      // 🎯 MEDIUM DENSITY: Balanced optimization
      qualitySettings = {
        minPixelSize: 3.5,
        pointAlpha: 0.3,
        lineAlpha: 0.3,
        circleSegments: 4
      };
    } else {
      // ✅ LOW DENSITY: Light optimization
      qualitySettings = {
        minPixelSize: 2.0,
        pointAlpha: 0.8,
        lineAlpha: 1.0,
        circleSegments: 8
      };
    }

    // Debug logging
    if (primitives.length > 100) {
      const qualityLevel = visiblePercentage > 60 ? 'LOW' : visiblePercentage > 30 ? 'MEDIUM' : 'HIGH';
      console.log(`🎯 Adaptive LOD: ${visiblePercentage}% visible -> Quality: ${qualityLevel}`);
    }

    primitives.forEach(primitive => {
      switch (primitive.type) {
        case 'line':
          this.drawAdaptiveLine(primitive, offsetX, offsetY, scale, qualitySettings);
          break;
        case 'rectangle':
          this.drawAdaptiveRectangle(primitive, offsetX, offsetY, scale, qualitySettings);
          break;
        default:
          this.drawPrimitiveNormal(primitive);
      }
    });
  }
  private drawAdaptiveLine(primitive: Primitive, offsetX: number, offsetY: number, scale: number, quality: any): void {
    const [x1, y1, x2, y2, r, g, b, a] = primitive.data;
    let finalColor = { r, g, b, a };
    const isLightTheme = document.body.classList.contains('theme-light');
    let adaptiveAlpha = quality.lineAlpha;

    if (isLightTheme) {
      // Light mode: ensure visibility by adjusting alpha for white lines
      if (r === 1 && g === 1 && b === 1) {
        finalColor = { r: 0, g: 0, b: 0, a }; // Convert white to black
        adaptiveAlpha = Math.min(1.0, quality.lineAlpha * 1.5); // Increase visibility in light mode
      }
    }
    
    const screenX1 = (x1 + offsetX) * scale;
    const screenY1 = (y1 + offsetY) * scale;
    const screenX2 = (x2 + offsetX) * scale;
    const screenY2 = (y2 + offsetY) * scale;
    
    const screenLength = Math.sqrt(
      Math.pow(screenX2 - screenX1, 2) + Math.pow(screenY2 - screenY1, 2)
    );
    
    if (screenLength < quality.minPixelSize) {
      const pointAlpha = isLightTheme && r === 1 && g === 1 && b === 1 
        ? Math.min(1.0, quality.pointAlpha * 1.5)
        : quality.pointAlpha;
        
      this.drawCircle(
        (x1 + x2) / 2, (y1 + y2) / 2,
        quality.minPixelSize / scale * 0.3,
        finalColor.r, finalColor.g, finalColor.b, finalColor.a * pointAlpha,
        quality.circleSegments,
        false
      );
    } else {
      // Draw line with adaptive quality and theme-aware color/alpha
      this.drawLine(x1, y1, x2, y2, 
        finalColor.r, finalColor.g, finalColor.b, finalColor.a * adaptiveAlpha);
    }
  }
  private drawAdaptiveRectangle(primitive: Primitive, offsetX: number, offsetY: number, scale: number, quality: any): void {
    const [x1, y1, x2, y2, r, g, b, a] = primitive.data;
    let finalColor = { r, g, b, a };
    const isLightTheme = document.body.classList.contains('theme-light');
    let adaptiveAlpha = quality.lineAlpha;

    if (isLightTheme) {
      // Light mode: ensure visibility by adjusting alpha for white rectangles
      if (r === 1 && g === 1 && b === 1) {
        finalColor = { r: 0, g: 0, b: 0, a }; // Convert white to black
        adaptiveAlpha = Math.min(1.0, quality.lineAlpha * 1.5); // Increase visibility in light mode
      }
    }
    
    const screenWidth = Math.abs(x2 - x1) * scale;
    const screenHeight = Math.abs(y2 - y1) * scale;
    
    if (screenWidth < quality.minPixelSize && screenHeight < quality.minPixelSize) {
      const pointAlpha = isLightTheme && r === 1 && g === 1 && b === 1 
        ? Math.min(1.0, quality.pointAlpha * 1.5) 
        : quality.pointAlpha;
        
      this.drawCircle(
        (x1 + x2) / 2, (y1 + y2) / 2,
        quality.minPixelSize / scale * 0.3,
        finalColor.r, finalColor.g, finalColor.b, finalColor.a * pointAlpha,
        quality.circleSegments,
        false
      );
    } else {
      // Draw rectangle with adaptive quality and theme-aware color/alpha
      this.drawRectangle(x1, y1, x2, y2, 
        finalColor.r, finalColor.g, finalColor.b, finalColor.a * adaptiveAlpha, false);
    }
  }
  private drawPrimitiveNormal(primitive: Primitive): void {
    const [x1, y1, x2, y2, r, g, b, a] = primitive.data;
    let finalColor = { r, g, b, a };
    const isLightTheme = document.body.classList.contains('theme-light');
    
    if (isLightTheme && r === 1 && g === 1 && b === 1) {
      finalColor = { r: 0, g: 0, b: 0, a };
    }
    
    switch (primitive.type) {
      case 'line':
        this.drawLine(x1, y1, x2, y2, finalColor.r, finalColor.g, finalColor.b, finalColor.a);
        break;
      case 'rectangle':
        this.drawRectangle(x1, y1, x2, y2, finalColor.r, finalColor.g, finalColor.b, finalColor.a, false);
        break;
    }
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
import { layerService } from './LayerService';
import { getErrorMessage } from '../utils/errorHandling';
import type { Point } from '../types/ToolTypes';

export interface Primitive {
  id: string;
  type: 'line' | 'rectangle' | 'circle';
  data: number[];
  originalColor?: { r: number; g: number; b: number; a: number };
  layerId?: string | null;
}

export interface SelectionResult {
  selectedIds: string[];
  selectionMode: 'intersection' | 'containment';
}

export class SelectionService {
  private primitives: Map<string, Primitive> = new Map();
  private nextId: number = 1;
  
  // 🎯 PERFORMANCE: Add caching for expensive operations
  private selectionCache = new Map<string, SelectionResult>();
  private distanceCache = new Map<string, number>();
  private cacheTimeout: number | null = null;

  // Enhanced type-safe error handling methods
  private handleError(method: string, error: unknown, context?: any): never {
    const errorMessage = `SelectionService.${method} failed: ${getErrorMessage(error)}`;
    console.error(`🚨 ${errorMessage}`, { context, error });
    throw new Error(errorMessage);
  }

  private safeOperation<T>(method: string, operation: () => T, context?: any): T {
    try {
      return operation();
    } catch (error) {
      return this.handleError(method, error, context);
    }
  }

  // Clear cache periodically
  private clearCache() {
    this.selectionCache.clear();
    this.distanceCache.clear();
  }

  // Schedule cache clearing
  private scheduleCacheClear() {
    if (this.cacheTimeout) {
      clearTimeout(this.cacheTimeout);
    }
    this.cacheTimeout = window.setTimeout(() => {
      this.clearCache();
    }, 5000);
  }

  // Registration with layer awareness
  registerPrimitiveWithId(id: string, type: Primitive['type'], data: number[], layerId?: string | null): void {
    this.safeOperation('registerPrimitiveWithId', () => {
      // 🎯 PERFORMANCE: Clear cache when primitives change
      this.clearCache();
      
      if (!id || id.trim() === '') {
        throw new Error('Primitive ID cannot be empty');
      }
      
      if (!data || data.length === 0) {
        throw new Error('Primitive data cannot be empty');
      }
      
      const assignedLayerId = layerId !== undefined ? layerId : layerService.getActiveLayerId();
      
      this.primitives.set(id, { 
        id, 
        type, 
        data, 
        layerId: assignedLayerId 
      });

      if (assignedLayerId) {
        try {
          // Avoid notifying on every primitive registration to prevent N redraws during bulk ops
          layerService.assignPrimitiveToLayer(id, assignedLayerId, { notify: false });
        } catch (layerError) {
          console.warn(`⚠️ Could not assign primitive ${id} to layer ${assignedLayerId}:`, getErrorMessage(layerError));
        }
      }
    }, { id, type, data, layerId });
  }

  registerPrimitive(type: Primitive['type'], data: number[], layerId?: string | null): string {
    return this.safeOperation('registerPrimitive', () => {
      const assignedLayerId = layerId ?? layerService.getActiveLayerId();
      
      if (type === 'line') {
        const index = this.primitives.size;
        const id = `line-${index}`;
        this.registerPrimitiveWithId(id, type, data, assignedLayerId);
        return id;
      } else {
        const id = `primitive-${this.nextId++}`;
        this.registerPrimitiveWithId(id, type, data, assignedLayerId);
        return id;
      }
    }, { type, data, layerId });
  }

  unregisterPrimitive(id: string): void {
    this.safeOperation('unregisterPrimitive', () => {
      // 🎯 FIX: Clear cache when primitives change
      this.clearCache();
      
      const primitive = this.primitives.get(id);
      
      // 🎯 FIX: Remove from layer WITHOUT calling LayerService (breaks circular dependency)
      if (primitive && primitive.layerId) {
        // Direct layer removal without service call
        const layer = layerService.getLayer(primitive.layerId);
        if (layer && layer.primitiveIds.has(id)) {
          layer.primitiveIds.delete(id);
        }
      }
      
      // Remove from primitives map
      this.primitives.delete(id);
    }, { id });
  }

  // Setters and getters
  getPrimitive(id: string): Primitive | undefined {
    return this.safeOperation('getPrimitive', () => {
      return this.primitives.get(id);
    }, { id });
  }

  getAllPrimitives(): Primitive[] {
    return this.safeOperation('getAllPrimitives', () => {
      return Array.from(this.primitives.values()).filter(primitive => {
          if (!primitive.data || primitive.data.length === 0) return false;
          
          if (!primitive.layerId) return true;

          const layer = layerService.getLayer(primitive.layerId);
          if (layer && !layer.properties.visible) {
            return false;
          }
          
          return true;
      });
    });
  }

  getPrimitivesByIds(ids: string[]): Primitive[] {
    return this.safeOperation('getPrimitivesByIds', () => {
      const primitives = ids.map(id => this.primitives.get(id)).filter(Boolean) as Primitive[];
      
      return primitives.filter(primitive => {
          if (primitive.layerId) {
              const layer = layerService.getLayer(primitive.layerId);
              if (layer && layer.properties.locked) {
                  console.log(`🔒 Skipping primitive on locked layer: ${primitive.id}`);
                  return false;
              }
          }
          return true;
      });
    }, { ids });
  }

  selectByRectangle(rectStart: Point, rectEnd: Point, 
                   existingSelection: string[] = []): SelectionResult {
    return this.safeOperation('selectByRectangle', () => {
      const cacheKey = `rect_${rectStart.x},${rectStart.y}_${rectEnd.x},${rectEnd.y}_${existingSelection.join(',')}`;
      
      if (this.selectionCache.has(cacheKey)) {
        return this.selectionCache.get(cacheKey)!;
      }

      const selectedIds = new Set<string>(existingSelection);
      const isLeftToRight = rectEnd.x >= rectStart.x;
      const selectionMode: 'intersection' | 'containment' = isLeftToRight ? 'containment' : 'intersection';
      
      const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isDevelopment) {
        console.log(`Selection mode: ${selectionMode} (${isLeftToRight ? 'L→R' : 'R→L'})`);
      }

      for (const [id, primitive] of this.primitives) {
        if (this.shouldSkipPrimitiveDueToLayer(primitive)) {
            continue;
        }

        if (this.isPrimitiveInRectangle(primitive, rectStart, rectEnd, selectionMode)) {
          // 🎯 FIX: Only add to selection if the primitive is editable (not locked)
          if (this.isPrimitiveEditable(primitive)) {
            selectedIds.add(id);
          }

          const layer = primitive.layerId ? layerService.getLayer(primitive.layerId) : null;
          if (isDevelopment) {
            console.log(`✅ Selected: ${id} on layer: ${layer ? layer.name : 'Orphaned'}`);
          }
        }
      }

      if (isDevelopment) {
        console.log(`Total selected: ${selectedIds.size}`);
      }

      const result: SelectionResult = {
        selectedIds: Array.from(selectedIds),
        selectionMode
      };

      this.selectionCache.set(cacheKey, result);
      this.scheduleCacheClear();

      return result;
    }, { rectStart, rectEnd, existingSelection });
  }

  selectByPoint(point: Point, threshold: number = 10, 
                existingSelection: string[] = [], shiftKey: boolean = false): string[] {
    return this.safeOperation('selectByPoint', () => {
      const selectedIds = shiftKey ? new Set(existingSelection) : new Set<string>();
      let closestDistance = threshold;
      let closestId: string | null = null;

      for (const [id, primitive] of this.primitives) {
        if (this.shouldSkipPrimitiveDueToLayer(primitive)) {
            continue;
        }

        const distance = this.distanceToPrimitive(primitive, point);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestId = id;
        }
      }

      if (closestId) {
        if (shiftKey && selectedIds.has(closestId)) {
          selectedIds.delete(closestId);
        } else {
          selectedIds.add(closestId);
        }
      }

      return Array.from(selectedIds);
    }, { point, threshold, existingSelection, shiftKey });
  }

  getPrimitivesByLayer(layerId: string): Primitive[] {
    return this.safeOperation('getPrimitivesByLayer', () => {
      return Array.from(this.primitives.values()).filter(primitive => 
          primitive.layerId === layerId
      );
    }, { layerId });
  }

  movePrimitivesToLayer(primitiveIds: string[], targetLayerId: string | null): boolean {
    return this.safeOperation('movePrimitivesToLayer', () => {
      // 🎯 FIX: If targetLayerId is null, DELETE the primitives (no orphans)
      if (targetLayerId === null) {
        this.deletePrimitives(primitiveIds);
        console.log(`🗑️ Deleted ${primitiveIds.length} primitives (no target layer)`);
        return true;
      }
      
      let success = true;
      
      primitiveIds.forEach(primitiveId => {
        const primitive = this.primitives.get(primitiveId);
        if (primitive) {
          // 🎯 FIX: Update layer reference directly
          const previousLayerId = primitive.layerId;
          primitive.layerId = targetLayerId;
          
          // Update layer assignments directly (no service call)
          if (previousLayerId) {
            const previousLayer = layerService.getLayer(previousLayerId);
            if (previousLayer && previousLayer.primitiveIds.has(primitiveId)) {
              previousLayer.primitiveIds.delete(primitiveId);
            }
          }
          
          const targetLayer = layerService.getLayer(targetLayerId);
          if (targetLayer && targetLayer.type === 'layer') {
            targetLayer.primitiveIds.add(primitiveId);
          } else {
            success = false;
            console.warn(`⚠️ Cannot assign primitive to ${targetLayer?.type}`);
          }
        }
      });

      console.log(`🔄 Moved ${primitiveIds.length} primitives to layer: ${targetLayerId}`);
      return success;
    }, { primitiveIds, targetLayerId });
  }

  updatePrimitiveData(id: string, newData: number[]): boolean {
    return this.safeOperation('updatePrimitiveData', () => {
      const primitive = this.primitives.get(id);
      if (!primitive) return false;
      
      primitive.data = newData;
      console.log(`📝 Updated primitive data: ${id}`);
      return true;
    }, { id, newData });
  }

  syncPrimitivesWithLines(lines: number[][]): void {
    this.safeOperation('syncPrimitivesWithLines', () => {
      console.log(`🔄 Syncing ${lines.length} lines with primitives`);

      const currentPrimitives = this.getAllPrimitives();
      const existingPrimitives = new Map();

      currentPrimitives.forEach(prim => {
          if (prim.id.startsWith('line-')) {
              existingPrimitives.set(prim.id, prim);
          }
      });

      console.log(`📊 Existing primitives: ${existingPrimitives.size}`);

      lines.forEach((line, index) => {
        const predictableId = `line-${index}`;
        
        if (existingPrimitives.has(predictableId)) {
            const existingPrim = existingPrimitives.get(predictableId);
            this.updatePrimitiveData(predictableId, line);
            existingPrimitives.delete(predictableId);
            console.log(`📝 Updated: ${predictableId} (layer: ${existingPrim.layerId})`);
        } else {
            const activeLayerId = layerService.getActiveLayerId();
            this.registerPrimitiveWithId(predictableId, 'line', line, activeLayerId);
            console.log(`➕ New: ${predictableId} → layer: ${activeLayerId}`);
        }
      });

      existingPrimitives.forEach((primitive, id) => {
        this.unregisterPrimitive(id);
        console.log(`🗑️ Deleted: ${id} (was on layer: ${primitive.layerId})`);
      });

      console.log("✅ Sync completed");
    }, { lines });
  }

  // Helper functions
  private shouldSkipPrimitiveDueToLayer(primitive: Primitive): boolean {
    if (!primitive.layerId) return false;
    
    const layer = layerService.getLayer(primitive.layerId);
    if (!layer) return false;
    
    // 🎯 FIX: Use EFFECTIVE properties (with inheritance)
    const effectiveProps = layerService.getEffectiveProperties(primitive.layerId);
    
    // 🎯 FIX: Only skip if HIDDEN (locked layers should still be visible but not selectable)
    if (!effectiveProps.visible) {
        return true;
    }
    
    return false;
  }

  private isPrimitiveEditable(primitive: Primitive): boolean {
    if (!primitive.layerId) return true;
    
    const layer = layerService.getLayer(primitive.layerId);
    if (!layer) return true;
    
    // 🎯 Use effective properties for lock check
    const effectiveProps = layerService.getEffectiveProperties(primitive.layerId);
    return !effectiveProps.locked;
  }

  getPrimitivesByType(type: Primitive['type']): Primitive[] {
    return this.safeOperation('getPrimitivesByType', () => {
      return this.getAllPrimitives().filter(p => p.type === type);
    }, { type });
  }

  deletePrimitives(ids: string[]): void {
    this.safeOperation('deletePrimitives', () => {
      ids.forEach(id => {
        const primitive = this.primitives.get(id);
        if (primitive && primitive.layerId) {
          // Remove primitive from layer WITHOUT notifying on each primitive
          layerService.assignPrimitiveToLayer(id, null, { notify: false });
        }
        // Now it is safe for SelectionService to delete its own primitive entry
        this.primitives.delete(id);
      });
      console.log(`🗑️ Deleted ${ids.length} primitives`);
    }, { ids });
  }

  // Geometry methods
  private isPrimitiveInRectangle(primitive: Primitive, rectStart: Point, 
                                rectEnd: Point, mode: 'intersection' | 'containment'): boolean {
    const { x: x1, y: y1 } = rectStart;
    const { x: x2, y: y2 } = rectEnd;
    
    const rectLeft = Math.min(x1, x2);
    const rectRight = Math.max(x1, x2);
    const rectTop = Math.min(y1, y2);
    const rectBottom = Math.max(y1, y2);

    switch (primitive.type) {
      case 'line':
        return this.isLineInRectangle(primitive.data, rectLeft, rectRight, rectTop, rectBottom, mode);
      default:
        return false;
    }
  }

  private isLineInRectangle(lineData: number[], rectLeft: number, rectRight: number, 
                           rectTop: number, rectBottom: number, mode: 'intersection' | 'containment'): boolean {
    const [x1, y1, x2, y2] = lineData;
    
    if (mode === 'containment') {
      return this.isPointInRectangle(x1, y1, rectLeft, rectRight, rectTop, rectBottom) &&
             this.isPointInRectangle(x2, y2, rectLeft, rectRight, rectTop, rectBottom);
    } else {
      return this.lineIntersectsRectangle(x1, y1, x2, y2, rectLeft, rectRight, rectTop, rectBottom);
    }
  }

  private isPointInRectangle(x: number, y: number, left: number, right: number, top: number, bottom: number): boolean {
    return x >= left && x <= right && y >= top && y <= bottom;
  }

  private lineIntersectsRectangle(x1: number, y1: number, x2: number, y2: number, 
                                 left: number, right: number, top: number, bottom: number): boolean {
    if (this.isPointInRectangle(x1, y1, left, right, top, bottom) ||
        this.isPointInRectangle(x2, y2, left, right, top, bottom)) {
      return true;
    }

    return this.lineIntersectsLine(x1, y1, x2, y2, left, top, right, top) ||
           this.lineIntersectsLine(x1, y1, x2, y2, right, top, right, bottom) ||
           this.lineIntersectsLine(x1, y1, x2, y2, right, bottom, left, bottom) ||
           this.lineIntersectsLine(x1, y1, x2, y2, left, bottom, left, top);
  }

  private lineIntersectsLine(x1: number, y1: number, x2: number, y2: number,
                            x3: number, y3: number, x4: number, y4: number): boolean {
    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (denom === 0) return false;

    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  }

  private distanceToPrimitive(primitive: Primitive, point: Point): number {
    // 🎯 PERFORMANCE: Cache distance calculations
    const cacheKey = `dist_${primitive.id}_${point.x},${point.y}`;
    
    if (this.distanceCache.has(cacheKey)) {
      return this.distanceCache.get(cacheKey)!;
    }

    let distance: number;
    switch (primitive.type) {
      case 'line':
        distance = this.distanceToLine(primitive.data, point);
        break;
      default:
        distance = Infinity;
    }

    // 🎯 Cache the result
    this.distanceCache.set(cacheKey, distance);
    this.scheduleCacheClear();

    return distance;
  }

  private distanceToLine(lineData: number[], point: Point): number {
    const [x1, y1, x2, y2] = lineData;
    const { x, y } = point;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  clearAll(): void {
    this.safeOperation('clearAll', () => {
      // Clear selection internal state only. Do not touch LayerService here to avoid
      // delete/reassign races — LayerService is authoritative for layer membership.
      this.primitives.clear();
      this.nextId = 1;
      // 🎯 PERFORMANCE: Clear cache
      this.clearCache();
    });
  }

  // Replace internal primitives map from authoritative app primitives in one shot.
  // This avoids touching LayerService (no assign/unassign calls) and is much faster
  // for bulk syncs such as loading or when appState.primitives changes.
  syncPrimitives(primitives: { id: string; type: Primitive['type']; data: number[]; layerId?: string | null }[]): void {
    this.safeOperation('syncPrimitives', () => {
      this.clearCache();
      this.primitives.clear();

      for (const p of primitives) {
        this.primitives.set(p.id, {
          id: p.id,
          type: p.type,
          data: p.data,
          layerId: p.layerId
        });
      }

      // Keep internal ID counter reasonable
      this.nextId = Math.max(this.nextId, this.primitives.size + 1);
    }, { primitives });
  }
}

export const selectionService = new SelectionService();
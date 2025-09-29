// services/SelectionService.ts
import { layerService } from './LayerService';

export interface Primitive {
  id: string;
  type: 'line' | 'rectangle' | 'circle';
  data: number[];
  originalColor?: { r: number; g: number; b: number; a: number };
  layerId?: string | null; // New: Layer association
}

export interface SelectionResult {
  selectedIds: string[];
  selectionMode: 'intersection' | 'containment';
}

export class SelectionService {
  private primitives: Map<string, Primitive> = new Map();
  private nextId: number = 1;

  // Registration with layer awareness
  registerPrimitiveWithId(id: string, type: Primitive['type'], data: number[], layerId?: string | null): void {
    
    if (!data || data.length === 0) {
      console.warn('Attempted to register primitive with empty data:', id);
      return;
    }
    
    const assignedLayerId = layerId !== undefined ? layerId : layerService.getActiveLayerId();
    
    this.primitives.set(id, { 
      id, 
      type, 
      data, 
      layerId: assignedLayerId 
    });

    if (assignedLayerId) {
      layerService.assignPrimitiveToLayer(id, assignedLayerId);
    }
  }
  registerPrimitive(type: Primitive['type'], data: number[], layerId?: string | null): string {
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
  }
  unregisterPrimitive(id: string): void {
    const primitive = this.primitives.get(id);
    if (primitive && primitive.layerId) {
        // Remove from layer service
        layerService.assignPrimitiveToLayer(id, null);
    }
    this.primitives.delete(id);
  }

  // Setters and getters
  getPrimitive(id: string): Primitive | undefined {
    return this.primitives.get(id);
  }
  getAllPrimitives(): Primitive[] {
    // Enhanced: Filter by layer visibility/lock
    return Array.from(this.primitives.values()).filter(primitive => {
        if (!primitive.data || primitive.data.length === 0) return false;
        
        if (!primitive.layerId) return true;

        // Check layer visibility
        const layer = layerService.getLayer(primitive.layerId);
        if (layer && !layer.properties.visible) {
          return false; // Skip primitives on hidden layers
        }
        
        return true;
    });
  }
  getPrimitivesByIds(ids: string[]): Primitive[] {
    // Enhanced: Respect layer locking for selection
    const primitives = ids.map(id => this.primitives.get(id)).filter(Boolean) as Primitive[];
    
    // Filter out primitives on locked layers
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
  }
  selectByRectangle(rectStart: { x: number; y: number }, rectEnd: { x: number; y: number }, 
                   existingSelection: string[] = []): SelectionResult {
    // Enhanced selection with layer awareness
    const selectedIds = new Set<string>(existingSelection);
    const isLeftToRight = rectEnd.x >= rectStart.x;
    const selectionMode = isLeftToRight ? 'containment' : 'intersection';
    
    console.log(`Selection mode: ${selectionMode} (${isLeftToRight ? 'L→R' : 'R→L'})`);

    for (const [id, primitive] of this.primitives) {
      // Skip primitives on locked or hidden layers
      if (this.shouldSkipPrimitiveDueToLayer(primitive)) {
          continue;
      }

      if (this.isPrimitiveInRectangle(primitive, rectStart, rectEnd, selectionMode)) {
        selectedIds.add(id);

        const layer = primitive.layerId ? layerService.getLayer(primitive.layerId) : null;
        console.log(`✅ Selected: ${id} on layer: ${layer ? layer.name : 'Orphaned'}`);
      }
    }

    console.log(`Total selected: ${selectedIds.size}`);

    return {
      selectedIds: Array.from(selectedIds),
      selectionMode
    };
  }
  selectByPoint(point: { x: number; y: number }, threshold: number = 10, 
                existingSelection: string[] = [], shiftKey: boolean = false): string[] {
    // Enhanced point selection with layer awareness
    const selectedIds = shiftKey ? new Set(existingSelection) : new Set<string>();
    let closestDistance = threshold;
    let closestId: string | null = null;

    for (const [id, primitive] of this.primitives) {
      // Skip primitives on locked or hidden layers
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
  }
  getPrimitivesByLayer(layerId: string): Primitive[] {
    // Get primitives by layer
    return Array.from(this.primitives.values()).filter(primitive => 
        primitive.layerId === layerId
    );
  }
  movePrimitivesToLayer(primitiveIds: string[], targetLayerId: string | null): boolean {
    // Move primitives between layers
    let success = true;
    
    primitiveIds.forEach(primitiveId => {
      const primitive = this.primitives.get(primitiveId);
      if (primitive) {
        primitive.layerId = targetLayerId;
        if (!layerService.assignPrimitiveToLayer(primitiveId, targetLayerId)) {
          success = false;
        }
      }
    });

    console.log(`🔄 Moved ${primitiveIds.length} primitives to layer: ${targetLayerId || 'orphaned'}`);
    return success;
  }
  updatePrimitiveData(id: string, newData: number[]): boolean {
    const primitive = this.primitives.get(id);
    if (!primitive) return false;
    
    // Update data but preserve layer assignment
    primitive.data = newData;
    console.log(`📝 Updated primitive data: ${id}`);
    return true;
  }
  syncPrimitivesWithLines(lines: number[][]): void {
    // Sync primitives with lines array (incremental approach)
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
          // New line - get current active layer
          const activeLayerId = layerService.getActiveLayerId();
          this.registerPrimitiveWithId(predictableId, 'line', line, activeLayerId);
          console.log(`➕ New: ${predictableId} → layer: ${activeLayerId}`);
      }
    });

    // Remove deleted primitives
    existingPrimitives.forEach((primitive, id) => {
      this.unregisterPrimitive(id);
      console.log(`🗑️ Deleted: ${id} (was on layer: ${primitive.layerId})`);
    });

    console.log("✅ Sync completed");
  }

  // Helper functions
  private shouldSkipPrimitiveDueToLayer(primitive: Primitive): boolean {
    // Check if primitive should be skipped due to layer state
    if (!primitive.layerId) return false; // Orphaned primitives are always selectable
    
    const layer = layerService.getLayer(primitive.layerId);
    if (!layer) return false; // Layer not found, allow selection
    
    // Skip if layer is locked or hidden
    if (layer.properties.locked) {
        return true;
    }
    if (!layer.properties.visible) {
        return true;
    }
    
    return false;
  }
  getPrimitivesByType(type: Primitive['type']): Primitive[] {
    return this.getAllPrimitives().filter(p => p.type === type);
  }
  deletePrimitives(ids: string[]): void {
    ids.forEach(id => {
      const primitive = this.primitives.get(id);
      if (primitive && primitive.layerId) {
        layerService.assignPrimitiveToLayer(id, null); // Unassign from layer
      }
      this.primitives.delete(id);
    });
    console.log(`🗑️ Deleted ${ids.length} primitives`);
  }

  // Geometry methods
  private isPrimitiveInRectangle(primitive: Primitive, rectStart: { x: number; y: number }, 
                                rectEnd: { x: number; y: number }, mode: 'intersection' | 'containment'): boolean {
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
  private distanceToPrimitive(primitive: Primitive, point: { x: number; y: number }): number {
    switch (primitive.type) {
      case 'line':
        return this.distanceToLine(primitive.data, point);
      default:
        return Infinity;
    }
  }
  private distanceToLine(lineData: number[], point: { x: number; y: number }): number {
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
    // Unregister all primitives from layers
    this.primitives.forEach((primitive, id) => {
        if (primitive.layerId) {
            layerService.assignPrimitiveToLayer(id, null);
        }
    });
    
    this.primitives.clear();
    this.nextId = 1;
  }
}

export const selectionService = new SelectionService();
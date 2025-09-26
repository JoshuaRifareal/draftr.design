// Handle snapping logic
// 1. Vertex snapping
// 2. Orthogonal snapping
// 3. Constraint snapping
// 4. Priority Handling
// 5. Intersection detection
// 6. Temporary state management


// ===== INTERFACES AND TYPES =====
export type SnapType = 
  | 'vertex' 
  | 'ortho' 
  | 'constraint' 
  | 'intersection' 
  | 'midpoint'
  | 'perpendicular' 
  | 'center'
  | 'none';

export interface SnapResult {
  position: { x: number; y: number };
  type: SnapType;
  metadata?: {
    vertex?: { x: number; y: number };
    angleDeg?: number;
    constraint?: { x: number; y: number; type: 'horizontal' | 'vertical' };
    segment?: { x1: number; y1: number; x2: number; y2: number };
  };
  strength: number;
}

export interface SnappingConfig {
  enabled: boolean;
  thresholdPx: number;
  orthoEnabled: boolean;
  orthoThresholdDeg: number;
  orthoAnglesDeg: number[];
  constraintEnabled: boolean;
  priorities: SnapType[];
}

export interface SnappingContext {
  lines: number[][];
  vertexConstraints: { x: number; y: number }[];
  activeConstraint: { x: number; y: number; type: 'horizontal' | 'vertical' } | null;
  currentStart: { x: number; y: number } | null;
  shiftHeld: boolean;
  orthoTempDisabled: boolean;
  constraintTempDisabled: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface ISnappingService {
  findSnap(
    screenPos: { x: number; y: number },
    context: SnappingContext
  ): SnapResult;
  
  updateConfig(config: Partial<SnappingConfig>): void;
  getConfig(): SnappingConfig;
  worldToScreen(worldPos: { x: number; y: number }, context: SnappingContext): { x: number; y: number };
  screenToWorld(screenPos: { x: number; y: number }, context: SnappingContext): { x: number; y: number };
}

// ===== CONTEXT MANAGER =====
export class SnappingContextManager {
  private currentContext: SnappingContext;

  constructor(initialContext: Partial<SnappingContext> = {}) {
    this.currentContext = {
      lines: [],
      vertexConstraints: [],
      activeConstraint: null,
      currentStart: null,
      shiftHeld: false,
      orthoTempDisabled: false,
      constraintTempDisabled: false,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      ...initialContext
    };
  }

  updateContext(updates: Partial<SnappingContext>): void {
    this.currentContext = { ...this.currentContext, ...updates };
  }

  getContext(): SnappingContext {
    return { ...this.currentContext };
  }
}

// ===== DEFAULT SNAPPING SERVICE IMPLEMENTATION =====
export class DefaultSnappingService implements ISnappingService {
  private config: SnappingConfig;

  constructor() {
    this.config = {
      enabled: true,
      thresholdPx: 25,
      orthoEnabled: true,
      orthoThresholdDeg: 5,
      orthoAnglesDeg: [0, 45, 90, 135],
      constraintEnabled: true,
      priorities: ['vertex', 'intersection', 'constraint', 'ortho']
    };
  }

  findSnap(screenPos: { x: number; y: number }, context: SnappingContext): SnapResult {
    if (!this.config.enabled) {
      return this.createNoSnapResult(this.screenToWorld(screenPos, context));
    }
  
    // Follow priority system
    for (const priority of this.config.priorities) {
      let result: SnapResult | null = null;
      
      switch (priority) {
        case 'vertex':
          result = this.findVertexSnap(screenPos, context);
          break;
        case 'intersection':
          result = this.findIntersectionSnap(screenPos, context);
          break;
        case 'constraint':
          result = this.findConstraintSnap(screenPos, context);
          break;
        case 'ortho':
          result = this.findOrthoSnap(this.screenToWorld(screenPos, context), context);
          break;
      }
  
      if (result && result.type !== 'none') {
        return result;
      }
    }
  
    return this.createNoSnapResult(this.screenToWorld(screenPos, context));
  }

  private findVertexSnap(screenPos: { x: number; y: number }, context: SnappingContext): SnapResult {
    if (context.orthoTempDisabled) {
      return this.createNoSnapResult(this.screenToWorld(screenPos, context));
    }
  
    let closest: { x: number; y: number } | null = null;
    let minDist = this.config.thresholdPx;
  
    // Check all line endpoints in SCREEN SPACE
    for (const line of context.lines.slice(0, context.lines.length - 1)) {
      const pts = [
        { x: line[0], y: line[1] },
        { x: line[2], y: line[3] },
      ];
      
      for (const pt of pts) {
        const screenPt = this.worldToScreen(pt, context);
        
        const dx = screenPt.x - screenPos.x;
        const dy = screenPt.y - screenPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < minDist) {
          minDist = dist;
          closest = pt;
        }
      }
    }
  
    if (closest) {
      const strength = 1 - (minDist / this.config.thresholdPx);
      return {
        position: closest,
        type: 'vertex',
        metadata: { vertex: closest },
        strength: Math.max(0, Math.min(1, strength))
      };
    }
  
    return this.createNoSnapResult(this.screenToWorld(screenPos, context));
  }

  private findConstraintSnap(screenPos: { x: number; y: number }, context: SnappingContext): SnapResult {
    if (!this.config.constraintEnabled || context.constraintTempDisabled || context.vertexConstraints.length === 0) {
      return this.createNoSnapResult(this.screenToWorld(screenPos, context));
    }

    let closestConstraint: { x: number; y: number; type: 'horizontal' | 'vertical'; distance: number } | null = null;
    const thresholdScreen = this.config.thresholdPx;

    for (const constraint of context.vertexConstraints) {
      const constraintScreen = this.worldToScreen(constraint, context);
      
      // Horizontal constraint (y alignment in screen space)
      const horizontalDist = Math.abs(constraintScreen.y - screenPos.y);
      if (horizontalDist < thresholdScreen) {
        if (!closestConstraint || horizontalDist < closestConstraint.distance) {
          closestConstraint = { 
            x: constraint.x, 
            y: constraint.y, 
            type: 'horizontal', 
            distance: horizontalDist 
          };
        }
      }

      // Vertical constraint (x alignment in screen space)
      const verticalDist = Math.abs(constraintScreen.x - screenPos.x);
      if (verticalDist < thresholdScreen) {
        if (!closestConstraint || verticalDist < closestConstraint.distance) {
          closestConstraint = { 
            x: constraint.x, 
            y: constraint.y, 
            type: 'vertical', 
            distance: verticalDist 
          };
        }
      }
    }

    if (closestConstraint) {
      // Convert screen cursor to world for constrained position calculation
      const cursorWorld = this.screenToWorld(screenPos, context);
      
      const constrainedPos = closestConstraint.type === 'horizontal' 
        ? { x: cursorWorld.x, y: closestConstraint.y }
        : { x: closestConstraint.x, y: cursorWorld.y };
      
      const strength = 1 - (closestConstraint.distance / thresholdScreen);
      
      return {
        position: constrainedPos,
        type: 'constraint',
        metadata: { constraint: closestConstraint },
        strength: Math.max(0, Math.min(1, strength))
      };
    }

    return this.createNoSnapResult(this.screenToWorld(screenPos, context));
  }

  private findOrthoSnap(cursorWorld: { x: number; y: number }, context: SnappingContext): SnapResult {
    if (!this.config.orthoEnabled || !context.currentStart || context.orthoTempDisabled) {
      return this.createNoSnapResult(cursorWorld);
    }

    const shouldUseOrtho = context.shiftHeld || (this.config.orthoEnabled && !context.orthoTempDisabled);
    if (!shouldUseOrtho) {
      return this.createNoSnapResult(cursorWorld);
    }

    const nearest = this.nearestOrthoAngleDeg(context.currentStart, cursorWorld);
    if (nearest.diff > this.config.orthoThresholdDeg) {
      return this.createNoSnapResult(cursorWorld);
    }

    const dx = cursorWorld.x - context.currentStart.x;
    const dy = cursorWorld.y - context.currentStart.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const rad = (nearest.angle * Math.PI) / 180.0;
    
    const constrainedPos = {
      x: context.currentStart.x + Math.cos(rad) * dist,
      y: context.currentStart.y + Math.sin(rad) * dist
    };

    const strength = 1 - (nearest.diff / this.config.orthoThresholdDeg);
    return {
      position: constrainedPos,
      type: 'ortho',
      metadata: { angleDeg: nearest.angle },
      strength: Math.max(0, Math.min(1, strength))
    };
  }

  private nearestOrthoAngleDeg(start: { x: number; y: number }, cursorWorld: { x: number; y: number }) {
    const dx = cursorWorld.x - start.x;
    const dy = cursorWorld.y - start.y;
    const angleRad = Math.atan2(dy, dx);
    let angleDeg = (angleRad * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;

    let bestCandidate = this.config.orthoAnglesDeg[0];
    let bestBase = this.config.orthoAnglesDeg[0];
    let bestDiff = 360;

    for (const base of this.config.orthoAnglesDeg) {
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

  private findIntersectionSnap(screenPos: { x: number; y: number }, context: SnappingContext): SnapResult {
    if (!context.currentStart || !context.activeConstraint) {
      return this.createNoSnapResult(this.screenToWorld(screenPos, context));
    }

    const cursorWorld = this.screenToWorld(screenPos, context);
    const nearest = this.nearestOrthoAngleDeg(context.currentStart, cursorWorld);

    if (nearest.diff > this.config.orthoThresholdDeg) {
      return this.createNoSnapResult(cursorWorld);
    }

    const intersection = this.calculateIntersection(context.currentStart, context.activeConstraint, nearest.angle);

    if (!intersection) {
      return this.createNoSnapResult(cursorWorld);
    }

    // Proximity check in screen space
    const intersectionScreen = this.worldToScreen(intersection, context);
    const cursorScreen = screenPos;
    
    const dx = intersectionScreen.x - cursorScreen.x;
    const dy = intersectionScreen.y - cursorScreen.y;
    const screenDistance = Math.sqrt(dx * dx + dy * dy);
    const thresholdScreen = this.config.thresholdPx;

    if (screenDistance < thresholdScreen) {
      const strength = 1 - (screenDistance / thresholdScreen);
      return {
        position: intersection,
        type: 'intersection',
        metadata: { 
          constraint: context.activeConstraint,
          angleDeg: nearest.angle 
        },
        strength: Math.max(0, Math.min(1, strength))
      };
    }

    return this.createNoSnapResult(cursorWorld);
  }

  private calculateIntersection(
    start: { x: number; y: number }, 
    constraint: { x: number; y: number; type: 'horizontal' | 'vertical' },
    orthoAngleDeg: number
  ): { x: number; y: number } | null {
    const angleRad = (orthoAngleDeg * Math.PI) / 180;
    const m = Math.tan(angleRad);
    const b = start.y - m * start.x;
    
    if (constraint.type === 'horizontal') {
      return {
        x: (constraint.y - b) / m,
        y: constraint.y
      };
    } else {
      return {
        x: constraint.x,
        y: m * constraint.x + b
      };
    }
  }

  worldToScreen(worldPos: { x: number; y: number }, context: SnappingContext): { x: number; y: number } {
    const screenX = (worldPos.x + context.offsetX) * context.scale;
    const screenY = (worldPos.y + context.offsetY) * context.scale;
    
    return { x: screenX, y: screenY };
  }

  screenToWorld(screenPos: { x: number; y: number }, context: SnappingContext): { x: number; y: number } {
    const worldX = screenPos.x / context.scale - context.offsetX;
    const worldY = screenPos.y / context.scale - context.offsetY;
    
    return { x: worldX, y: worldY };
  }

  updateConfig(config: Partial<SnappingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): SnappingConfig {
    return { ...this.config };
  }

  private createNoSnapResult(position: { x: number; y: number }): SnapResult {
    return {
      position,
      type: 'none',
      strength: 0
    };
  }
}

// ===== CONVENIENCE EXPORTS =====
// Pre-instantiated services for easy use
export const snappingService = new DefaultSnappingService();
export const contextManager = new SnappingContextManager();
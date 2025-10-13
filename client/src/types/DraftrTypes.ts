export interface DrawingPrimitive {
    id: string;
    type: 'line' | 'rectangle' | 'circle';
    data: number[];
    layerId?: string | null;
}

export interface SnapResult {
    position: { x: number; y: number };
    type: 'none' | 'vertex' | 'intersection' | 'constraint' | 'ortho';
    strength: number;
    metadata?: any;
}

export interface SnappingContext {
    primitives: DrawingPrimitive[];
    vertexConstraints: {x: number, y: number}[];
    activeConstraint: {x: number, y: number, type: 'horizontal' | 'vertical'} | null;
    currentStart: {x: number, y: number} | null;
    shiftHeld: boolean;
    orthoTempDisabled: boolean;
    constraintTempDisabled: boolean;
    scale: number;
    offsetX: number;
    offsetY: number;
}


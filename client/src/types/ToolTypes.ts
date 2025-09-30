export type ToolType = 'SELECTION' | 'LINE' | 'RECTANGLE' | 'CIRCLE';
export type SnapType = 'vertex' | 'ortho' | 'constraint' | 'intersection' | 'midpoint' | 'perpendicular' | 'center' | 'none';
export type ConstraintType = 'horizontal' | 'vertical';

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// Type guards
export const isValidToolType = (tool: string): tool is ToolType => {
  return ['SELECTION', 'LINE', 'RECTANGLE', 'CIRCLE'].includes(tool);
};

export const isValidSnapType = (snap: string): snap is SnapType => {
  return ['vertex', 'ortho', 'constraint', 'intersection', 'midpoint', 'perpendicular', 'center', 'none'].includes(snap);
};

export const isValidConstraintType = (constraint: string): constraint is ConstraintType => {
  return ['horizontal', 'vertical'].includes(constraint);
};
export interface LayerProperties {
    name: string;
    type: 'layer' | 'group' | 'block';
    visible: boolean;
    locked: boolean;
    color: { r: number; g: number; b: number; a: number };
    opacity: number;
    expanded: boolean;
}

export interface Layer {
    id: string;
    name: string;
    type: 'layer' | 'group' | 'block';
    parentId: string | null;
    properties: LayerProperties;
    children: Layer[];
    primitiveIds: Set<string>;
    blockSourceId?: string;
    isBlockInstance?: boolean;
}

export interface BlockDefinition {
    id: string;
    name: string;
    sourceLayerId: string;
    primitiveIds: Set<string>;
    instanceIds: Set<string>;
}
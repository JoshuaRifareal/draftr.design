// services/LayerService.ts
import { getErrorMessage } from '../utils/errorHandling';
import type { Point } from '../types/ToolTypes';

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
    // 🎯 FIX: Only LAYERS have primitives, groups/blocks have empty sets
    primitiveIds: Set<string>; 
    // Block system fields
    blockSourceId?: string;
    isBlockInstance?: boolean;
    instancePosition?: Point; // For block instances
}

export interface BlockDefinition {
    id: string;
    name: string;
    sourceLayerId: string;
    layerHierarchy: Layer[]; // Deep copy of the original hierarchy
    primitiveIds: Set<string>; // Shared primitives across all instances
    instanceIds: Set<string>;
    instanceCounter: number; // For auto-naming
}

export class LayerService {
    private layers: Map<string, Layer> = new Map();
    private activeLayerId: string | null = null;
    private blockDefinitions: Map<string, BlockDefinition> = new Map();
    private groupCounter: number = 1;
    private blockCounter: number = 1;
    private autoEditLayerId: string | null = null;
    private layerToBlockMap: Map<string, string> = new Map();

    // Enhanced Event system
    private listeners: Map<string, Set<() => void>> = new Map();
    
    private readonly EVENT_TYPES = {
        LAYERS_CHANGED: 'layersChanged',
        ACTIVE_LAYER_CHANGED: 'activeLayerChanged', 
        LAYER_PROPERTIES_CHANGED: 'layerPropertiesChanged',
        BLOCK_DEFINITIONS_CHANGED: 'blockDefinitionsChanged'
    } as const;

    private readonly PREDEFINED_LAYER_NAMES = {
        DEFAULT: 'Default',
        TEXT: 'Text', 
        DIMENSIONS: 'Dimensions',
        IMAGES: 'Images'
    };

    constructor() {
        this.initializeDefaultLayerOnly();
        console.log('🎯 Enhanced LayerService initialized');
    }

    // ==================== CORE LAYER MANAGEMENT ====================

    createLayer(name: string, type: 'layer' | 'group' | 'block' = 'layer', parentId: string | null = null): Layer {
        return this.safeOperation('createLayer', () => {
        if (!name || name.trim() === '') {
            throw new Error('Layer name cannot be empty');
        }

        // 🎯 FIX: Use type-specific ID generation
        const id = this.generateLayerId(type);
        const parent = parentId ? this.layers.get(parentId) : null;

        if (parentId && !parent) {
            throw new Error(`Parent layer not found: ${parentId}`);
        }

        const layer: Layer = {
            id,
            name: name.trim(),
            type,
            parentId,
            properties: {
            name: name.trim(),
            type,
            visible: true,
            locked: false,
            color: this.getDefaultColor(type),
            opacity: 1.0,
            expanded: true
            },
            children: [],
            // 🎯 FIX: Only layers can have primitives
            primitiveIds: type === 'layer' ? new Set() : new Set()
        };

        if (parentId && parent) {
            parent.children.push(layer);
        }

        this.layers.set(id, layer);
        console.log('✅ Layer created:', { id, name, type, parentId });
        this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
        return layer;
        }, { name, type, parentId });
    }

    deleteLayer(layerId: string): boolean {
        return this.safeOperation('deleteLayer', () => {
        if (this.PREDEFINED_LAYER_NAMES.DEFAULT === layerId) {
            throw new Error('Cannot delete Default layer');
        }

        const layer = this.layers.get(layerId);
        if (!layer) {
            console.warn('🚫 Layer not found for deletion:', layerId);
            throw new Error(`Layer not found: ${layerId}`);
        }

        console.log('🔍 DELETE LAYER - Processing:', {
            id: layerId,
            type: layer.type,
            isBlockInstance: layer.isBlockInstance,
            blockSourceId: layer.blockSourceId,
            children: layer.children.length
        });

        // Handle block instances and definitions
        if (layer.isBlockInstance && layer.blockSourceId) {
            console.log('🧱 Deleting BLOCK INSTANCE:', layerId);
            this.deleteBlockInstance(layerId);
        } else if (layer.type === 'block' && !layer.isBlockInstance) {
            console.log('🧱 Deleting BLOCK DEFINITION via layer:', layerId);
            
            // 🎯 FIX: Find the actual block definition ID from the layer ID
            const blockId = this.getBlockIdFromLayerId(layerId);
            if (blockId) {
            console.log('🔍 Found block definition ID:', blockId);
            this.deleteBlockDefinition(blockId);
            } else {
            console.warn('🚫 Could not find block definition for layer:', layerId);
            // Fallback: try using the layer ID as block ID
            this.deleteBlockDefinition(layerId);
            }
            
            // 🎯 FIX: Return true but DON'T continue with normal deletion
            return true;
        }

        // For groups, delete entire hierarchy including ALL primitives
        if (layer.type === 'group') {
            console.log('📁 Deleting GROUP:', layerId);
            this.deleteGroupHierarchy(layer);
        } else if (layer.type === 'layer') {
            console.log('🎨 Deleting LAYER:', layerId);
            // For regular layers, delete their primitives
            this.deleteAllPrimitivesInLayer(layerId);
            this.cleanupPrimitivesFromDeletedLayer(layerId);
        }

        // Remove from parent's children
        if (layer.parentId) {
            const parent = this.layers.get(layer.parentId);
            if (parent) {
            parent.children = parent.children.filter(child => child.id !== layerId);
            }
        }

        // Remove the layer itself
        this.layers.delete(layerId);
        
        // Update active layer if needed
        if (this.activeLayerId === layerId) {
            this.activeLayerId = this.PREDEFINED_LAYER_NAMES.DEFAULT;
            this.notifyListeners(this.EVENT_TYPES.ACTIVE_LAYER_CHANGED);
        }

        console.log('✅ Layer deletion completed:', { id: layerId, type: layer.type });
        this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
        return true;
        }, { layerId });
    }

    private isBlockDefinition(layerId: string): boolean {
        const layer = this.layers.get(layerId);
        if (!layer) return false;
        
        // Check if this layer ID exists in blockDefinitions as a source
        for (const [blockId, blockDef] of this.blockDefinitions) {
        if (blockDef.sourceLayerId === layerId) {
            return true;
        }
        }
        return false;
    }

    private getBlockIdFromLayerId(layerId: string): string | null {
    // Check if this layer is a block definition source
    for (const [blockId, blockDef] of this.blockDefinitions) {
        if (blockDef.sourceLayerId === layerId) {
        return blockId;
        }
    }
    return null;
    }

    // 🎯 NEW METHOD: Delete block instance (organizational only - keep child layers)
    private deleteBlockInstance(instanceId: string): void {
        const instance = this.layers.get(instanceId);
        if (!instance || !instance.blockSourceId) return;

        const blockDef = this.blockDefinitions.get(instance.blockSourceId);
        if (blockDef) {
        // Remove from block definition's instance tracking
        blockDef.instanceIds.delete(instanceId);
        }

        // 🎯 FIX: Reparent instance's child layers to instance's parent
        const instanceParentId = instance.parentId;
        
        instance.children.forEach(child => {
        child.parentId = instanceParentId;
        
        if (instanceParentId) {
            const instanceParent = this.layers.get(instanceParentId);
            if (instanceParent) {
            instanceParent.children.push(child);
            }
        }
        });

        // Clear children before deletion
        instance.children = [];
        
        console.log('🗑️ Block instance deleted, child layers preserved:', instanceId);
    }

    // 🎯 NEW METHOD: Delete group hierarchy including all child layers and their primitives
    private deleteGroupHierarchy(group: Layer): void {
        // Recursively delete all children
        group.children.forEach(child => {
        if (child.type === 'layer') {
            // Delete layer and its primitives
            this.deleteAllPrimitivesInLayer(child.id);
            this.cleanupPrimitivesFromDeletedLayer(child.id);
        } else if (child.type === 'group') {
            // Recursively delete sub-groups
            this.deleteGroupHierarchy(child);
        } else if (child.type === 'block') {
            // Delete blocks
            if (child.isBlockInstance) {
            this.removeBlockInstance(child.blockSourceId!, child.id);
            } else {
            this.deleteBlockDefinition(child.id);
            }
        }
        
        // Remove child from layers map
        this.layers.delete(child.id);
        });
    }

    // 🎯 NEW METHOD: Clean up primitives from AppState that reference deleted layers
    private cleanupPrimitivesFromDeletedLayer(deletedLayerId: string): void {
        if (typeof (window as any).appStateStore !== 'undefined') {
        const appStateStore = (window as any).appStateStore;
        const currentState = appStateStore.getState();
        
        // Find primitives that reference the deleted layer
        const primitivesWithDeletedLayer = currentState.primitives.filter(
            p => p.layerId === deletedLayerId
        );
        
        if (primitivesWithDeletedLayer.length > 0) {
            console.log(`🧹 Cleaning up ${primitivesWithDeletedLayer.length} primitives from deleted layer: ${deletedLayerId}`);
            
            // Remove these primitives from AppState
            const updatedPrimitives = currentState.primitives.filter(
            p => p.layerId !== deletedLayerId
            );
            
            appStateStore.updateState({
            primitives: updatedPrimitives
            });
        }
        }
    }

    // ==================== PROPERTY MANAGEMENT & INHERITANCE ====================

    getEffectiveProperties(layerId: string): LayerProperties {
        return this.safeOperation('getEffectiveProperties', () => {
        const layer = this.layers.get(layerId);
        if (!layer) return this.getDefaultProperties();

        // No parent - return own properties
        if (!layer.parentId) {
            return { ...layer.properties };
        }

        const parentProps = this.getEffectiveProperties(layer.parentId);
        const effectiveProps: LayerProperties = { ...layer.properties };

        // 🎯 FIX: Visibility and Lock are COMPLETELY inherited (no override)
        effectiveProps.visible = effectiveProps.visible && parentProps.visible;
        effectiveProps.locked = effectiveProps.locked || parentProps.locked;

        // Opacity: Compounded inheritance (parent * child)
        effectiveProps.opacity = parentProps.opacity * layer.properties.opacity;

        // Color: Only inherit if colors are exactly equal
        const colorsEqual = this.areColorsEqual(layer.properties.color, parentProps.color);
        if (colorsEqual) {
            effectiveProps.color = { ...parentProps.color };
        }

        return effectiveProps;
        }, { layerId });
    }

    updateLayerProperties(layerId: string, updates: Partial<LayerProperties>): boolean {
        return this.safeOperation('updateLayerProperties', () => {
            const layer = this.layers.get(layerId);
            if (!layer) return false;

            const oldProperties = { ...layer.properties };
            layer.properties = { ...layer.properties, ...updates };

            // Update block instances if this is a block definition
            if (layer.type === 'block' && !layer.isBlockInstance) {
                this.updateBlockInstances(layerId, updates);
            }

            console.log('⚙️ Layer properties updated:', { layerId, updates });
            this.notifyListeners(this.EVENT_TYPES.LAYER_PROPERTIES_CHANGED);
            
            // Always trigger redraw on property changes
            this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
            
            return true;
        }, { layerId, updates });
    }

    // ==================== BLOCK SYSTEM ====================

    createBlockFromLayers(layerIds: string[], blockName?: string): string {
        return this.safeOperation('createBlockFromLayers', () => {
        if (layerIds.length === 0) {
            throw new Error('Cannot create block from empty selection');
        }

        const blockId = this.generateLayerId('block');
        const name = blockName || `Block ${this.blockCounter++}`;

        // Create block definition layer (organizational only)
        const blockLayer = this.createLayer(name, 'block');
        
        // 🎯 FIX: Store mapping between layer ID and block ID
        this.layerToBlockMap.set(blockLayer.id, blockId);

        // 🎯 FIX: Set auto-edit flag for inline editing
        this.autoEditLayerId = blockLayer.id;

        // Collect all layers and their primitives
        const allLayers: Layer[] = [];
        const allPrimitiveIds = new Set<string>();
        
        layerIds.forEach(layerId => {
            const layer = this.layers.get(layerId);
            if (layer) {
            allLayers.push(layer);
            // Move primitives to this layer (they stay in original layers)
            const primitives = this.getPrimitivesByLayer(layerId);
            primitives.forEach(primId => allPrimitiveIds.add(primId));
            
            // Reparent to block
            this.reparentLayer(layerId, blockLayer.id);
            }
        });

        // Create deep copy of hierarchy for block definition
        const hierarchyCopy = this.deepCopyLayerHierarchy(blockLayer);

        // Create block definition
        const blockDef: BlockDefinition = {
            id: blockId,
            name,
            sourceLayerId: blockLayer.id, // This is the key connection!
            layerHierarchy: hierarchyCopy,
            primitiveIds: allPrimitiveIds,
            instanceIds: new Set(),
            instanceCounter: 1
        };

        this.blockDefinitions.set(blockId, blockDef);
        
        console.log('🧱 Block created:', { 
            blockId, 
            sourceLayerId: blockLayer.id,
            name, 
            layers: allLayers.length 
        });
        
        this.notifyListeners(this.EVENT_TYPES.BLOCK_DEFINITIONS_CHANGED);
        this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
        return blockLayer.id;
        }, { layerIds, blockName });
    }

    instantiateBlock(blockId: string, position: Point): string {
        return this.safeOperation('instantiateBlock', () => {
            const blockDef = this.blockDefinitions.get(blockId);
            if (!blockDef) {
                throw new Error(`Block definition not found: ${blockId}`);
            }

            const instanceId = this.generateLayerId();
            const instanceName = `${blockDef.name} Instance ${blockDef.instanceCounter++}`;
            
            // Create instance layer (organizational)
            const instanceLayer = this.createLayer(instanceName, 'block');
            instanceLayer.isBlockInstance = true;
            instanceLayer.blockSourceId = blockId;
            instanceLayer.instancePosition = position;

            // Create deep copy of the block hierarchy for this instance
            const instanceHierarchy = this.deepCopyLayerHierarchy(instanceLayer, blockDef.layerHierarchy);
            
            // Add all instance layers to the main layers map
            this.addHierarchyToLayers(instanceHierarchy, instanceLayer.id);

            // Track instance
            blockDef.instanceIds.add(instanceLayer.id);

            console.log('📦 Block instantiated:', { blockId, instanceId, position });
            this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
            return instanceLayer.id;
        }, { blockId, position });
    }

    // ==================== GROUP MANAGEMENT ====================

    createGroupFromLayers(layerIds: string[], groupName?: string): string {
        return this.safeOperation('createGroupFromLayers', () => {
        if (layerIds.length === 0) {
            throw new Error('Cannot create group from empty selection');
        }

        // 🎯 FIX: Use 'group' type for ID generation
        const groupId = this.generateLayerId('group');
        const name = groupName || `Group ${this.groupCounter++}`;

        // Create group layer (organizational only)
        const groupLayer = this.createLayer(name, 'group');

        // 🎯 FIX: Set auto-edit flag
        this.autoEditLayerId = groupLayer.id;

        // Reparent selected layers to group
        layerIds.forEach(layerId => {
            this.reparentLayer(layerId, groupLayer.id);
        });

        console.log('📁 Group created:', { groupId, name, childCount: layerIds.length });
        this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
        return groupLayer.id;
        }, { layerIds, groupName });
    }

    ungroupLayers(groupLayerIds: string[]): void {
        this.safeOperation('ungroupLayers', () => {
            groupLayerIds.forEach(groupLayerId => {
                const groupLayer = this.layers.get(groupLayerId);
                if (!groupLayer || groupLayer.type !== 'group') return;

                const parentId = groupLayer.parentId;
                
                // Reparent children to group's parent
                groupLayer.children.forEach(child => {
                    child.parentId = parentId;
                    if (parentId) {
                        const parent = this.layers.get(parentId);
                        if (parent) {
                            parent.children.push(child);
                        }
                    }
                });

                // Delete the group (organizational only - no primitives to worry about)
                this.layers.delete(groupLayerId);
            });

            console.log('📤 Groups ungrouped:', groupLayerIds);
            this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
        }, { groupLayerIds });
    }

    // ==================== PRIMITIVE MANAGEMENT ====================

    assignPrimitiveToLayer(primitiveId: string, layerId: string | null): boolean {
        return this.safeOperation('assignPrimitiveToLayer', () => {
        if (!primitiveId || primitiveId.trim() === '') {
            throw new Error('Invalid primitiveId provided');
        }

        // 🎯 FIX: Only allow assignment to actual LAYERS (not groups/blocks)
        if (layerId) {
            const layer = this.layers.get(layerId);
            if (!layer) {
            throw new Error(`Target layer not found: ${layerId}`);
            }
            
            // 🎯 ONLY assign to actual layers (not groups/blocks)
            if (layer.type !== 'layer') {
            throw new Error(`Cannot assign primitives to ${layer.type} - only to layers`);
            }
            
            // Remove from all layers first (DIRECT OPERATION - no service calls)
            for (const existingLayer of this.layers.values()) {
            if (existingLayer.primitiveIds.has(primitiveId)) {
                existingLayer.primitiveIds.delete(primitiveId);
            }
            }
            
            // Add to target layer
            layer.primitiveIds.add(primitiveId);
        } else {
            // 🎯 FIX: NO ORPHANED PRIMITIVES - delete instead of orphan
            // Remove from all layers first
            for (const existingLayer of this.layers.values()) {
            if (existingLayer.primitiveIds.has(primitiveId)) {
                existingLayer.primitiveIds.delete(primitiveId);
            }
            }
            
            // 🎯 DIRECT deletion without calling SelectionService (breaks circular dependency)
            if (typeof (window as any).selectionService !== 'undefined') {
            // Use direct primitive removal instead of unregisterPrimitive
            const selectionService = (window as any).selectionService;
            if (selectionService.primitives && selectionService.primitives.has(primitiveId)) {
                selectionService.primitives.delete(primitiveId);
            }
            }
            console.log('🗑️ Deleted primitive (no layer assignment):', primitiveId);
        }
        
        this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
        return true;
        }, { primitiveId, layerId });
    }

    getPrimitivesByLayer(layerId: string): string[] {
        return this.safeOperation('getPrimitivesByLayer', () => {
        const layer = this.layers.get(layerId);
        // 🎯 FIX: Only return primitives if the layer is visible and not locked
        if (layer && layer.type === 'layer') {
            const effectiveProps = this.getEffectiveProperties(layerId);
            if (effectiveProps.visible && !effectiveProps.locked) {
            return Array.from(layer.primitiveIds);
            }
        }
        return [];
        }, { layerId });
    }

    // ==================== LAYER QUERIES & VALIDATION ====================

    canDrawOnLayer(layerId: string): boolean {
        return this.safeOperation('canDrawOnLayer', () => {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        // 🎯 FIX: Only LAYERS can be drawn on (not groups/blocks)
        if (layer.type !== 'layer') {
            return false;
        }

        const effectiveProps = this.getEffectiveProperties(layerId);
        return effectiveProps.visible && !effectiveProps.locked;
        }, { layerId });
    }

    getLayerByPrimitive(primitiveId: string): Layer | null {
        return this.safeOperation('getLayerByPrimitive', () => {
        for (const layer of this.layers.values()) {
            // 🎯 FIX: Only search in actual layers (not groups/blocks)
            if (layer.type === 'layer' && layer.primitiveIds.has(primitiveId)) {
            return layer;
            }
        }
        return null;
        }, { primitiveId });
    }

    // ==================== EXISTING API ====================

    setActiveLayer(layerId: string | null): boolean {
        return this.safeOperation('setActiveLayer', () => {
        if (layerId) {
            const layer = this.layers.get(layerId);
            if (!layer) {
            throw new Error(`Layer not found: ${layerId}`);
            }
            
            // 🎯 FIX: Only allow activating LAYERS (not groups/blocks)
            if (layer.type !== 'layer') {
            console.warn(`🚫 Cannot activate ${layer.type} - only layers can be active`);
            return false;
            }
        }

        this.activeLayerId = layerId;
        console.log('🎯 Active layer set to:', layerId || 'None (orphaning)');
        this.notifyListeners(this.EVENT_TYPES.ACTIVE_LAYER_CHANGED);
        this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED); // Trigger redraw
        return true;
        }, { layerId });
    }

    getActiveLayer(): Layer | null {
        return this.safeOperation('getActiveLayer', () => {
            return this.activeLayerId ? this.layers.get(this.activeLayerId) || null : null;
        });
    }

    getActiveLayerId(): string | null {
        return this.activeLayerId;
    }

    getLayerHierarchy(): Layer[] {
        return this.safeOperation('getLayerHierarchy', () => {
            return Array.from(this.layers.values()).filter(layer => !layer.parentId);
        });
    }

    getLayer(id: string): Layer | undefined {
        return this.safeOperation('getLayer', () => {
            return this.layers.get(id);
        }, { id });
    }

    getAllLayers(): Layer[] {
        return this.safeOperation('getAllLayers', () => {
            return Array.from(this.layers.values());
        });
    }

    getEventTypes() {
        return { ...this.EVENT_TYPES };
    }

    // ==================== PRIVATE METHODS ====================

    private initializeDefaultLayerOnly(): void {
        // 🎯 FIX: Create default as a 'layer' type
        const defaultLayer: Layer = {
        id: this.PREDEFINED_LAYER_NAMES.DEFAULT,
        name: 'Default',
        type: 'layer', // 🎯 This is important!
        parentId: null,
        properties: {
            name: 'Default',
            type: 'layer',
            locked: false,
            visible: true,
            color: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            opacity: 1.0,
            expanded: true
        },
        children: [],
        primitiveIds: new Set()
        };

        this.layers.set(defaultLayer.id, defaultLayer);
        this.activeLayerId = defaultLayer.id;
        console.log('📁 Default LAYER created at initialization');
    }

    private getDefaultColor(type: 'layer' | 'group' | 'block'): { r: number; g: number; b: number; a: number } {
        const colors = {
            layer: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            group: { r: 0.2, g: 0.4, b: 0.8, a: 1.0 },
            block: { r: 0.8, g: 0.4, b: 0.2, a: 1.0 }
        };
        return colors[type];
    }

    private getDefaultProperties(): LayerProperties {
        return {
            name: 'Unnamed',
            type: 'layer',
            locked: false,
            visible: true,
            color: this.getDefaultColor('layer'),
            opacity: 1.0,
            expanded: true
        };
    }

    private generateLayerId(type: 'layer' | 'group' | 'block' = 'layer'): string {
        // 🎯 FIX: Generate different IDs based on type for clarity
        const prefix = type === 'layer' ? 'layer' : type === 'group' ? 'group' : 'block';
        return `${prefix}-${crypto.randomUUID()}`;
    }

    private areColorsEqual(color1: { r: number; g: number; b: number; a: number }, color2: { r: number; g: number; b: number; a: number }): boolean {
        return color1.r === color2.r && 
               color1.g === color2.g && 
               color1.b === color2.b && 
               color1.a === color2.a;
    }

    private reparentLayer(layerId: string, newParentId: string): void {
        const layer = this.layers.get(layerId);
        const newParent = this.layers.get(newParentId);
        
        if (!layer || !newParent) return;

        // Remove from current parent
        if (layer.parentId) {
            const oldParent = this.layers.get(layer.parentId);
            if (oldParent) {
                oldParent.children = oldParent.children.filter(child => child.id !== layerId);
            }
        }

        // Add to new parent
        layer.parentId = newParentId;
        newParent.children.push(layer);
    }

    private deleteAllPrimitivesInHierarchy(layerId: string): void {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        // Delete primitives in this layer
        if (layer.type === 'layer') {
            layer.primitiveIds.forEach(primitiveId => {
                // Here you would call selectionService to actually delete the primitive
                console.log('🗑️ Deleting primitive:', primitiveId);
                // selectionService.unregisterPrimitive(primitiveId);
            });
            layer.primitiveIds.clear();
        }

        // Recursively delete primitives in children
        layer.children.forEach(child => this.deleteAllPrimitivesInHierarchy(child.id));
    }

    private removeBlockInstance(blockSourceId: string, instanceId: string): void {
        const blockDef = this.blockDefinitions.get(blockSourceId);
        if (blockDef) {
        blockDef.instanceIds.delete(instanceId);
        console.log('🔗 Block instance removed from definition:', instanceId);
        }
    }
    
    private deleteBlockDefinition(blockId: string): void {
        console.log('🔍 DELETE BLOCK DEFINITION - Starting:', blockId);
        
        const blockDef = this.blockDefinitions.get(blockId);
        if (!blockDef) {
        console.warn('🚫 Block definition not found:', blockId);
        return;
        }

        console.log('🔍 Found block definition:', {
        sourceLayerId: blockDef.sourceLayerId,
        instances: blockDef.instanceIds.size,
        name: blockDef.name
        });

        // Get the source layer (the block definition container)
        const sourceLayer = this.layers.get(blockDef.sourceLayerId);
        
        if (sourceLayer) {
        console.log('🔍 Found source layer:', {
            id: sourceLayer.id,
            children: sourceLayer.children.length,
            parentId: sourceLayer.parentId
        });

        // 🎯 FIX: Reparent all child layers to the block's parent before deletion
        const blockParentId = sourceLayer.parentId;
        
        sourceLayer.children.forEach(child => {
            console.log('🔍 Reparenting child layer:', child.id);
            
            // Reparent child layer to block's parent
            child.parentId = blockParentId;
            
            if (blockParentId) {
            // Add to grandparent's children
            const grandParent = this.layers.get(blockParentId);
            if (grandParent) {
                grandParent.children.push(child);
                console.log('✅ Child added to grandparent:', grandParent.id);
            } else {
                console.warn('🚫 Grandparent not found:', blockParentId);
            }
            } else {
            console.log('✅ Child becomes root layer (no parent)');
            }
        });
        
        // Clear children from source layer before deletion
        sourceLayer.children = [];
        
        // 🎯 FIX: Remove from layer-to-block mapping
        this.layerToBlockMap.delete(sourceLayer.id);
        
        // Delete the source layer (block definition container)
        this.layers.delete(sourceLayer.id);
        console.log('✅ Source layer deleted:', sourceLayer.id);
        } else {
        console.warn('🚫 Source layer not found:', blockDef.sourceLayerId);
        }

        // 🎯 FIX: Delete all block instances (organizational only)
        console.log('🔍 Deleting block instances:', blockDef.instanceIds.size);
        blockDef.instanceIds.forEach(instanceId => {
        const instance = this.layers.get(instanceId);
        if (instance) {
            console.log('🔍 Processing instance:', instanceId);
            
            // Reparent instance's child layers to instance's parent
            const instanceParentId = instance.parentId;
            
            instance.children.forEach(child => {
            console.log('🔍 Reparenting instance child:', child.id);
            child.parentId = instanceParentId;
            
            if (instanceParentId) {
                const instanceParent = this.layers.get(instanceParentId);
                if (instanceParent) {
                instanceParent.children.push(child);
                console.log('✅ Instance child added to parent:', instanceParentId);
                } else {
                console.warn('🚫 Instance parent not found:', instanceParentId);
                }
            } else {
                console.log('✅ Instance child becomes root layer');
            }
            });
            
            // Clear children and delete the instance
            instance.children = [];
            this.layers.delete(instanceId);
            console.log('✅ Instance deleted:', instanceId);
        } else {
            console.warn('🚫 Instance not found:', instanceId);
        }
        });

        // Remove the block definition
        this.blockDefinitions.delete(blockId);
        
        console.log('✅ Block definition completely deleted:', blockId);
        
        this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
        this.notifyListeners(this.EVENT_TYPES.BLOCK_DEFINITIONS_CHANGED);
    }

    private updateBlockInstances(blockId: string, updates: Partial<LayerProperties>): void {
        const blockDef = this.blockDefinitions.get(blockId);
        if (!blockDef) return;

        blockDef.instanceIds.forEach(instanceId => {
            const instance = this.layers.get(instanceId);
            if (instance) {
                instance.properties = { ...instance.properties, ...updates };
            }
        });
    }

    private deepCopyLayerHierarchy(rootLayer: Layer, sourceHierarchy?: Layer[]): Layer[] {
        if (!sourceHierarchy) {
            // Copy the root layer's own hierarchy
            return this.copyLayerTree([rootLayer]);
        }
        
        // Copy the provided hierarchy
        return this.copyLayerTree(sourceHierarchy);
    }

    private copyLayerTree(layers: Layer[]): Layer[] {
        return layers.map(layer => ({
            ...layer,
            id: this.generateLayerId(),
            children: this.copyLayerTree(layer.children),
            primitiveIds: new Set(layer.primitiveIds) // Copy primitive references
        }));
    }

    private addHierarchyToLayers(hierarchy: Layer[], parentId: string | null = null): void {
        hierarchy.forEach(layer => {
            layer.parentId = parentId;
            this.layers.set(layer.id, layer);
            this.addHierarchyToLayers(layer.children, layer.id);
        });
    }

    // ==================== ERROR HANDLING & EVENT SYSTEM ====================

    private handleError(method: string, error: unknown, context?: any): never {
        const errorMessage = `LayerService.${method} failed: ${getErrorMessage(error)}`;
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

    subscribe(eventType: string, listener: () => void): () => void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType)!.add(listener);
        
        return () => {
            this.listeners.get(eventType)?.delete(listener);
        };
    }

    private notifyListeners(eventType: string): void {
        this.listeners.get(eventType)?.forEach(listener => listener());
    }

    // 🎯 NEW METHOD: Get auto-edit layer ID
    getAutoEditLayerId(): string | null {
        return this.autoEditLayerId;
    }

    // 🎯 NEW METHOD: Clear auto-edit layer ID
    clearAutoEditLayerId(): void {
        this.autoEditLayerId = null;
    }

    // 🎯 NEW METHOD: Recursively delete layers and their primitives
    private deleteAllLayersInHierarchy(layer: Layer): void {
        // Delete primitives in this layer if it's a layer (not group/block)
        if (layer.type === 'layer') {
        this.deleteAllPrimitivesInLayer(layer.id);
        }

        // Recursively delete children
        layer.children.forEach(child => {
        this.deleteAllLayersInHierarchy(child);
        this.layers.delete(child.id);
        });
    }

    // 🎯 NEW METHOD: Delete all primitives in a specific layer
    private deleteAllPrimitivesInLayer(layerId: string): void {
        const layer = this.layers.get(layerId);
        if (!layer || layer.type !== 'layer') return;

        // 🎯 FIX: Direct deletion without service calls
        layer.primitiveIds.forEach(primitiveId => {
        // Remove from selection service directly
        if (typeof (window as any).selectionService !== 'undefined') {
            const selectionService = (window as any).selectionService;
            if (selectionService.primitives && selectionService.primitives.has(primitiveId)) {
            selectionService.primitives.delete(primitiveId);
            }
        }
        console.log('🗑️ Deleted primitive:', primitiveId);
        });
        layer.primitiveIds.clear();
    }
}

export const layerService = new LayerService();
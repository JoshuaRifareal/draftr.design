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
    layerHierarchy: Layer[];
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
    private inheritanceCache = new Map<string, LayerProperties>();
    private cacheVersion: number = 0;
    private rootLayers: Layer[] = [];

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
                primitiveIds: type === 'layer' ? new Set() : new Set()
            };

            if (parentId && parent) {
                parent.children.push(layer);
            } else {
                this.rootLayers.push(layer);
            }

            this.layers.set(id, layer);
            console.log('✅ Layer created:', { id, name, type, parentId });
            this.ensureDefaultLayerAtTop();
            this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
            this.invalidateInheritanceCache();
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

            // Remove from parent's children or from root layers if it's a root layer
            if (layer.parentId) {
                const parent = this.layers.get(layer.parentId);
                if (parent) {
                    parent.children = parent.children.filter(child => child.id !== layerId);
                }
            } else {
                this.rootLayers = this.rootLayers.filter(l => l.id !== layerId);
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
            this.invalidateInheritanceCache();
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

            return this.getCachedEffectiveProperties(layerId);
        }, { layerId });
    }
    updateLayerProperties(layerId: string, updates: Partial<LayerProperties>): boolean {
        return this.safeOperation('updateLayerProperties', () => {
            const layer = this.layers.get(layerId);
            if (!layer) return false;

            const oldProperties = { ...layer.properties };
            layer.properties = { ...layer.properties, ...updates };
            this.invalidateInheritanceCache(layerId);

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
            sourceLayerId: blockLayer.id,
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

            // Link to the block definition's hierarchy
            const instanceHierarchy = blockDef.layerHierarchy;
            
            // Add all instance layers to the main layers map
            this.addHierarchyToLayers(instanceHierarchy, instanceLayer.id);

            // Track instance
            blockDef.instanceIds.add(instanceLayer.id);

            console.log('📦 Block instantiated:', { blockId, instanceId, position });
            this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
            return instanceLayer.id;
        }, { blockId, position });
    }
    private updateBlockInstancesOptimized(blockId: string, updates: Partial<LayerProperties>): void {
        const blockDef = this.blockDefinitions.get(blockId);
        if (!blockDef) return;

        blockDef.instanceIds.forEach(instanceId => {
            const instance = this.layers.get(instanceId);
            if (instance) {
                instance.properties = { ...instance.properties, ...updates };
                // Invalidate cache for this instance
                this.invalidateInheritanceCache(instanceId);
            }
        });
    }

    // ==================== GROUP MANAGEMENT ====================

    createGroupFromLayers(layerIds: string[], groupName?: string, parentId: string | null = null): string {
        return this.safeOperation('createGroupFromLayers', () => {
            if (layerIds.length === 0) {
                throw new Error('Cannot create group from empty selection');
            }

            const groupId = this.generateLayerId('group');
            const name = groupName || `Group ${this.groupCounter++}`;

            // 🎯 FIX: Determine the insert position based on the first selected layer
            let insertBeforeId: string | undefined;
            if (layerIds.length > 0) {
                const firstLayer = this.layers.get(layerIds[0]);
                if (firstLayer) {
                    // Find the next sibling after the first selected layer
                    const siblings = firstLayer.parentId 
                        ? this.layers.get(firstLayer.parentId)?.children 
                        : this.rootLayers;
                    
                    if (siblings) {
                        const firstLayerIndex = siblings.findIndex(l => l.id === firstLayer.id);
                        if (firstLayerIndex !== -1 && firstLayerIndex + 1 < siblings.length) {
                            insertBeforeId = siblings[firstLayerIndex + 1].id;
                        }
                    }
                }
            }

            // Create group with specified parent and position
            const groupLayer = this.createLayer(name, 'group', parentId);

            // 🎯 FIX: Reposition the group to where the first selected layer was
            if (insertBeforeId) {
                this.reparentLayer(groupLayer.id, parentId, insertBeforeId);
            }

            // Set auto-edit flag
            this.autoEditLayerId = groupLayer.id;

            // 🎯 CRITICAL FIX: Collect layers first, then reparent them
            const layersToReparent = layerIds.map(id => this.layers.get(id)).filter(Boolean) as Layer[];

            console.log('🔍 Before grouping - Root layers:', this.rootLayers.map(l => l.id));
            console.log('🔍 Layers to reparent:', layersToReparent.map(l => l.id));

            layersToReparent.forEach(layer => {
                // 🎯 FIX: Remove from ALL possible locations
                // 1. Remove from current parent's children
                if (layer.parentId) {
                    const currentParent = this.layers.get(layer.parentId);
                    if (currentParent) {
                        currentParent.children = currentParent.children.filter(child => child.id !== layer.id);
                        console.log(`✅ Removed ${layer.id} from parent ${layer.parentId}`);
                    }
                } else {
                    // 2. Remove from root layers (CRITICAL)
                    const rootIndex = this.rootLayers.findIndex(l => l.id === layer.id);
                    if (rootIndex !== -1) {
                        this.rootLayers.splice(rootIndex, 1);
                        console.log(`✅ Removed ${layer.id} from root layers`);
                    }
                }

                // 🎯 FIX: Now reparent to group
                layer.parentId = groupLayer.id;
                groupLayer.children.push(layer);
                console.log(`✅ Added ${layer.id} to group ${groupLayer.id}`);
            });

            console.log('🔍 After grouping - Root layers:', this.rootLayers.map(l => l.id));
            console.log('🔍 Group children:', groupLayer.children.map(l => l.id));

            console.log('📁 Group created:', { 
                groupId: groupLayer.id, 
                name, 
                childCount: layersToReparent.length,
                position: insertBeforeId ? `before ${insertBeforeId}` : 'at end'
            });
            
            // 🎯 FIX: Force update to ensure UI reflects changes
            this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
            return groupLayer.id;
        }, { layerIds, groupName, parentId });
    }
    ungroupLayers(groupLayerIds: string[]): void {
        this.safeOperation('ungroupLayers', () => {
            groupLayerIds.forEach(groupLayerId => {
                const groupLayer = this.layers.get(groupLayerId);
                if (!groupLayer || groupLayer.type !== 'group') return;

                console.log('📤 Ungrouping:', groupLayerId, 'with', groupLayer.children.length, 'children');
                
                const parentId = groupLayer.parentId; 
                const targetParentId = parentId; // 🎯 FIX: Use group's parent (could be null for root)
                
                // 🎯 FIX: Reparent children to group's parent (or root if no parent)
                groupLayer.children.forEach(child => {
                    // Remove child from group's children first
                    child.parentId = targetParentId;
                    
                    if (targetParentId) {
                        // Add to group's parent
                        const parent = this.layers.get(targetParentId);
                        if (parent) {
                            parent.children.push(child);
                            console.log('✅ Moved child to parent:', child.id, '→', targetParentId);
                        }
                    } else {
                        // 🎯 CRITICAL: Add to root layers if ungrouping at root level
                        this.rootLayers.push(child);
                        console.log('✅ Moved child to root level:', child.id);
                    }
                });

                // Clear children before deletion
                groupLayer.children = [];

                // 🎯 FIX: Remove the group from its parent's children or root
                if (groupLayer.parentId) {
                    const parent = this.layers.get(groupLayer.parentId);
                    if (parent) {
                        parent.children = parent.children.filter(child => child.id !== groupLayerId);
                    }
                } else {
                    // Remove from root layers if it's a root group
                    this.rootLayers = this.rootLayers.filter(l => l.id !== groupLayerId);
                }

                // Delete the group itself
                this.layers.delete(groupLayerId);
                console.log('🗑️ Deleted group:', groupLayerId);
                
                // 🎯 FIX: Ensure Default layer stays at top
                this.ensureDefaultLayerAtTop();
            });

            console.log('📤 Groups ungrouped:', groupLayerIds);
            this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
        }, { groupLayerIds });
    }
    debugLayerHierarchy(): void {
        console.log('🔍 Layer Hierarchy Debug:');
        this.layers.forEach((layer, id) => {
            console.log(`  ${id}:`, {
                name: layer.name,
                type: layer.type,
                parentId: layer.parentId,
                children: layer.children.map(c => c.id),
                childrenCount: layer.children.length
            });
        });
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

    // ========================= SETTERS AND GETTERS ====================

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
        return this.rootLayers;
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

    // ==================== CIRCULAR REFERENCE PREVENTION ====================

    private canReparentSafely(sourceId: string, targetId: string): boolean {
        if (sourceId === targetId) {
            console.warn('🚫 Cannot reparent layer to itself:', sourceId);
            return false;
        }
        
        const targetHierarchy = this.getParentHierarchy(targetId);
        if (targetHierarchy.has(sourceId)) {
            console.warn('🚫 Circular reference prevented: cannot reparent', sourceId, 'to', targetId);
            return false;
        }
        
        return true;
    }
    private getParentHierarchy(layerId: string): Set<string> {
        const hierarchy = new Set<string>();
        let current = this.layers.get(layerId);
        
        while (current?.parentId) {
            hierarchy.add(current.parentId);
            current = this.layers.get(current.parentId);
        }
        
        return hierarchy;
    }

    // ==================== INHERITANCE CACHING SYSTEM ====================

    private getCachedEffectiveProperties(layerId: string): LayerProperties {
        const cacheKey = `${layerId}_v${this.cacheVersion}`;
        
        if (this.inheritanceCache.has(cacheKey)) {
            return this.inheritanceCache.get(cacheKey)!;
        }
        
        // Calculate and cache
        const props = this.calculateEffectiveProperties(layerId);
        this.inheritanceCache.set(cacheKey, props);
        return props;
    }
    private calculateEffectiveProperties(layerId: string): LayerProperties {
        const layer = this.layers.get(layerId);
        if (!layer) return this.getDefaultProperties();

        // No parent - return own properties
        if (!layer.parentId) {
            return { ...layer.properties };
        }

        const parentProps = this.getCachedEffectiveProperties(layer.parentId);
        const effectiveProps: LayerProperties = { ...layer.properties };

        // Inheritance logic (existing code)
        effectiveProps.visible = effectiveProps.visible && parentProps.visible;
        effectiveProps.locked = effectiveProps.locked || parentProps.locked;
        effectiveProps.opacity = parentProps.opacity * layer.properties.opacity;

        const colorsEqual = this.areColorsEqual(layer.properties.color, parentProps.color);
        if (colorsEqual) {
            effectiveProps.color = { ...parentProps.color };
        }

        return effectiveProps;
    }
    private invalidateInheritanceCache(layerId?: string): void {
        if (layerId) {
            // Invalidate this layer and all children
            this.invalidateHierarchyCache(layerId);
        } else {
            // Invalidate everything
            this.inheritanceCache.clear();
        }
        this.cacheVersion++;
    }
    private invalidateHierarchyCache(layerId: string): void {
        const layer = this.layers.get(layerId);
        if (!layer) return;
        
        // Invalidate this layer
        this.inheritanceCache.forEach((_, key) => {
            if (key.startsWith(`${layerId}_`)) {
                this.inheritanceCache.delete(key);
            }
        });
        
        // Recursively invalidate children
        layer.children.forEach(child => this.invalidateHierarchyCache(child.id));
    }

    // ======================== HELPER METHODS ====================

    private initializeDefaultLayerOnly(): void {
        // 🎯 FIX: Create default as a 'layer' type
        const defaultLayer: Layer = {
            id: this.PREDEFINED_LAYER_NAMES.DEFAULT,
            name: 'Default',
            type: 'layer',
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
        this.rootLayers = [defaultLayer];
        this.activeLayerId = defaultLayer.id;
        console.log('📁 Default layer created at initialization');
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

    // ======================== LAYER REORDER AND REPARENTING ====================

    reparentLayer(layerId: string, newParentId: string | null, insertBeforeId?: string): void {
        const layer = this.layers.get(layerId);
        const newParent = newParentId ? this.layers.get(newParentId) : null;
        
        if (!layer) return;
        
        // 🎯 OPTIMIZATION: Pure reordering (same parent)
        if (layer.parentId === newParentId) {
            this.reorderInParent(layerId, insertBeforeId);
            return;
        }

        // 🎯 FULL REPARENTING: Different parent
        
        // Safety check for circular references
        if (newParentId && !this.canReparentSafely(layerId, newParentId)) {
            console.warn('🚫 Circular reference prevented in reparentLayer');
            return;
        }

        // 🎯 CRITICAL FIX: Remove from current location FIRST
        if (layer.parentId) {
            // Remove from current parent's children
            const oldParent = this.layers.get(layer.parentId);
            if (oldParent) {
                oldParent.children = oldParent.children.filter(child => child.id !== layerId);
                console.log(`✅ Removed ${layerId} from parent ${layer.parentId}`);
            }
        } else {
            // 🎯 CRITICAL: Remove from root layers if it's a root layer
            const rootIndex = this.rootLayers.findIndex(l => l.id === layerId);
            if (rootIndex !== -1) {
                this.rootLayers.splice(rootIndex, 1);
                console.log(`✅ Removed ${layerId} from root layers`);
            } else {
                console.warn('⚠️ Layer not found in root layers during reparent:', layerId);
            }
        }

        // Remove from new parent's children if already there (prevent duplicates)
        if (newParent) {
            newParent.children = newParent.children.filter(child => child.id !== layerId);
        }

        // Add to new parent (if any) at correct position
        layer.parentId = newParentId;
        if (newParent) {
            // Insert at specific position
            if (insertBeforeId) {
                const insertIndex = newParent.children.findIndex(child => child.id === insertBeforeId);
                if (insertIndex !== -1) {
                    newParent.children.splice(insertIndex, 0, layer);
                } else {
                    newParent.children.push(layer); // Fallback: add to end
                }
            } else {
                newParent.children.push(layer); // Add to end
            }
            console.log(`✅ Added ${layerId} to parent ${newParentId}`);
        } else {
            // 🎯 FIX: Add to root layers if no parent
            this.rootLayers.push(layer);
            console.log(`✅ Added ${layerId} to root layers`);
        }
        
        // Invalidate cache for moved layer and children (parent changed)
        this.invalidateInheritanceCache(layerId);
        
        // Notify listeners of hierarchy change
        this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
        
        console.log('✅ Reparented:', layerId, '→', newParentId);
        
        // 🎯 DEBUG: Verify no duplicates
        this.debugVerifyNoDuplicates();
    }
    private debugVerifyNoDuplicates(): void {
        const allLayers = Array.from(this.layers.values());
        const layerIds = allLayers.map(l => l.id);
        const uniqueIds = new Set(layerIds);
        
        if (layerIds.length !== uniqueIds.size) {
            console.error('🚫 DUPLICATES DETECTED after reparent!');
            // Find duplicates
            const counts = new Map();
            layerIds.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
            const duplicates = Array.from(counts.entries()).filter(([id, count]) => count > 1);
            console.error('Duplicates:', duplicates);
        } else {
            console.log('✅ No duplicates after reparent');
        }
    }
    private reorderInParent(layerId: string, insertBeforeId?: string): void {
        const layer = this.layers.get(layerId);
        if (!layer) {
            console.error('🚫 Layer not found:', layerId);
            return;
        }

        // 🎯 DEBUG: Log initial state
        console.log('🔍 reorderInParent - START:', {
            layerId,
            layerName: layer.name,
            parentId: layer.parentId,
            insertBeforeId
        });

        // Get the correct siblings array
        let siblings: Layer[];
        if (layer.parentId) {
            const parent = this.layers.get(layer.parentId);
            if (!parent) {
                console.error('🚫 Parent not found:', layer.parentId);
                return;
            }
            siblings = parent.children;
            console.log('🔍 Parent children count:', parent.children.length);
        } else {
            // ROOT LEVEL
            this.reorderRootLayer(layerId, insertBeforeId);
            this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
            return;
        }

        // 🎯 DEBUG: Log current order
        console.log('🔍 Current order:', siblings.map(l => l.id));

        // Remove layer from current position
        const filteredSiblings = siblings.filter(child => child.id !== layerId);
        console.log('🔍 After removal:', filteredSiblings.map(l => l.id));

        // Find new position
        let insertIndex = filteredSiblings.length;
        if (insertBeforeId) {
            const insertBeforeIndex = filteredSiblings.findIndex(child => child.id === insertBeforeId);
            console.log('🔍 Insert before index search:', { insertBeforeId, foundIndex: insertBeforeIndex });
            if (insertBeforeIndex !== -1) {
                insertIndex = insertBeforeIndex;
            }
        }

        console.log('🔍 Final insert index:', insertIndex);

        // Insert layer at new position
        filteredSiblings.splice(insertIndex, 0, layer);
        console.log('🔍 After insertion:', filteredSiblings.map(l => l.id));

        // 🎯 FIX: Actually update the data structure
        if (layer.parentId) {
            const parent = this.layers.get(layer.parentId);
            if (parent) {
                parent.children = filteredSiblings;
                console.log('✅ Updated parent children array');
            }
        } else {
            // 🎯 CRITICAL FIX: For root level, we need to update the actual root structure
            // The issue is that filteredSiblings is a new array, not the actual root reference
            this.updateRootLayerOrder(filteredSiblings);
        }

        // Ensure Default layer is at top
        this.ensureDefaultLayerAtTop();

        console.log('🔄 Pure reordering COMPLETED:', layerId);
        
        this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
        
        // 🎯 DEBUG: Verify final state
        const finalSiblings = layer.parentId 
            ? this.layers.get(layer.parentId)?.children 
            : this.getLayerHierarchy();
        console.log('🔍 Final order:', finalSiblings?.map(l => l.id));
    }
    private updateRootLayerOrder(newOrder: Layer[]): void {
        console.log('🔧 Updating root layer order');
        
        // Get all layers and update their parentId to maintain consistency
        const allLayers = Array.from(this.layers.values());
        
        // For each layer in the new order, ensure it has no parent
        newOrder.forEach(layer => {
            layer.parentId = null;
        });
        
        // 🎯 IMPORTANT: We can't directly set the root order because getLayerHierarchy() 
        // returns a computed array. Instead, we need to ensure the layer service's 
        // internal state reflects the new order.
        
        // The actual reordering happens because we're modifying the layer objects
        // that are referenced in the getLayerHierarchy() result
        console.log('✅ Root order updated (order will reflect in next getLayerHierarchy() call)');
    }
    private reorderRootLayer(layerId: string, insertBeforeId?: string): void {
        console.log('🎯 ROOT-LEVEL REORDERING:', { layerId, insertBeforeId });
        
        const layer = this.layers.get(layerId);
        if (!layer) {
            console.error('🚫 Layer not found for reordering:', layerId);
            return;
        }

        // 🎯 CRITICAL: Ensure the layer is actually in rootLayers
        const currentIndex = this.rootLayers.findIndex(l => l.id === layerId);
        if (currentIndex === -1) {
            console.error('🚫 Layer not found in root layers:', layerId);
            console.log('🔍 Available root layers:', this.rootLayers.map(l => l.id));
            
            // 🎯 RECOVERY: Try to add the layer back to root
            if (!layer.parentId) {
                console.log('🔄 Recovering orphaned root layer:', layerId);
                this.rootLayers.push(layer);
            } else {
                console.error('🚫 Layer has parent, cannot add to root:', layer.parentId);
                return;
            }
        }

        // Remove from current position
        this.rootLayers = this.rootLayers.filter(l => l.id !== layerId);

        // Find new position
        let newIndex = this.rootLayers.length;
        if (insertBeforeId) {
            const targetIndex = this.rootLayers.findIndex(l => l.id === insertBeforeId);
            if (targetIndex !== -1) {
                newIndex = targetIndex;
            } else {
                console.warn('⚠️ insertBeforeId not found, adding to end:', insertBeforeId);
            }
        }

        // Insert at new position
        this.rootLayers.splice(newIndex, 0, layer);
        
        // Ensure Default layer stays at top
        this.ensureDefaultLayerAtTop();

        console.log('✅ Root reordering completed. New order:', this.rootLayers.map(l => l.id));
        
        // 🎯 CRITICAL: Verify the layer is still in the array
        const finalIndex = this.rootLayers.findIndex(l => l.id === layerId);
        if (finalIndex === -1) {
            console.error('🚫 CRITICAL: Layer disappeared during reordering!', layerId);
            // Emergency recovery
            this.rootLayers.push(layer);
        }
    }
    private ensureDefaultLayerAtTop(): void {
        const defaultLayerIndex = this.rootLayers.findIndex(l => l.id === 'Default');
        
        if (defaultLayerIndex !== -1 && defaultLayerIndex !== 0) {
            // Move Default layer to top
            const defaultLayer = this.rootLayers[defaultLayerIndex];
            this.rootLayers.splice(defaultLayerIndex, 1);
            this.rootLayers.unshift(defaultLayer);
            
            console.log('🔧 Moved Default layer to top');
        }
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
    notifyListeners(eventType: string): void {
        this.listeners.get(eventType)?.forEach(listener => listener());
    }
    getAutoEditLayerId(): string | null {
        return this.autoEditLayerId;
    }
    clearAutoEditLayerId(): void {
        this.autoEditLayerId = null;
    }
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
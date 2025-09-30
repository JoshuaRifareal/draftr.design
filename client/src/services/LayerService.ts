// services/LayerService.ts
import { getErrorMessage } from '../utils/errorHandling';

export interface LayerProperties {
    color?: { r: number; g: number; b: number; a: number };
    opacity?: number;
    locked: boolean;
    visible: boolean;
}

export interface Layer {
    id: string;
    name: string;
    parentId: string | null;
    properties: LayerProperties;
    children: Layer[];
    primitiveIds: Set<string>;
}

export class LayerService {
    private layers: Map<string, Layer> = new Map();
    private activeLayerId: string | null = null;

    // Enhanced Event system for layer changes
    private listeners: Map<string, Set<() => void>> = new Map();
    
    // Event types
    private readonly EVENT_TYPES = {
        LAYERS_CHANGED: 'layersChanged',
        ACTIVE_LAYER_CHANGED: 'activeLayerChanged',
        LAYER_PROPERTIES_CHANGED: 'layerPropertiesChanged'
    } as const;

    // Pre-defined layer names (but not created automatically)
    private readonly PREDEFINED_LAYER_NAMES = {
        DEFAULT: 'Default',
        TEXT: 'Text', 
        DIMENSIONS: 'Dimensions',
        IMAGES: 'Images'
    };

    constructor() {
        this.initializeDefaultLayerOnly();
        console.log('🎯 LayerService initialized with Default layer');
    }

    // Enhanced type-safe error handling methods
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

    private initializeDefaultLayerOnly(): void {
        // Create ONLY the Default layer at initialization
        const defaultLayer: Layer = {
            id: this.PREDEFINED_LAYER_NAMES.DEFAULT,
            name: 'Default',
            parentId: null,
            properties: {
                locked: false,
                visible: true,
                color: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                opacity: 1.0
            },
            children: [],
            primitiveIds: new Set()
        };

        this.layers.set(defaultLayer.id, defaultLayer);
        this.activeLayerId = defaultLayer.id;

        console.log('📁 Default layer created at initialization');
    }

    // Event system
    subscribe(eventType: string, listener: () => void): () => void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType)!.add(listener);
        
        // Return unsubscribe function
        return () => {
            this.listeners.get(eventType)?.delete(listener);
        };
    }

    private notifyListeners(eventType: string): void {
        this.listeners.get(eventType)?.forEach(listener => listener());
    }

    // Layers API
    createToolLayer(layerType: 'text' | 'dimensions' | 'images'): Layer {
        return this.safeOperation('createToolLayer', () => {
            const layerMap = {
                text: { id: this.PREDEFINED_LAYER_NAMES.TEXT, name: 'Text', color: { r: 0.0, g: 0.8, b: 0.2, a: 1.0 } },
                dimensions: { id: this.PREDEFINED_LAYER_NAMES.DIMENSIONS, name: 'Dimensions', color: { r: 0.8, g: 0.2, b: 0.0, a: 1.0 } },
                images: { id: this.PREDEFINED_LAYER_NAMES.IMAGES, name: 'Images', color: { r: 0.2, g: 0.5, b: 0.8, a: 1.0 } }
            };

            const config = layerMap[layerType];
            
            // Check if layer already exists
            const existingLayer = this.layers.get(config.id);
            if (existingLayer) {
                console.log('📁 Tool layer already exists:', config.id);
                return existingLayer;
            }

            // Create as standalone layer (parentId: null)
            const layer: Layer = {
                id: config.id,
                name: config.name,
                parentId: null, // Standalone, not child of Default
                properties: {
                    locked: false,
                    visible: true,
                    color: config.color,
                    opacity: 1.0
                },
                children: [],
                primitiveIds: new Set()
            };

            this.layers.set(layer.id, layer);
            console.log('🛠️ Tool layer created:', { id: layer.id, name: layer.name });
            return layer;
        }, { layerType });
    }

    getToolLayer(layerType: 'text' | 'dimensions' | 'images'): Layer | undefined {
        return this.safeOperation('getToolLayer', () => {
            const layerMap = {
                text: this.PREDEFINED_LAYER_NAMES.TEXT,
                dimensions: this.PREDEFINED_LAYER_NAMES.DIMENSIONS,
                images: this.PREDEFINED_LAYER_NAMES.IMAGES
            };

            return this.layers.get(layerMap[layerType]);
        }, { layerType });
    }

    ensureToolLayer(layerType: 'text' | 'dimensions' | 'images'): Layer {
        return this.safeOperation('ensureToolLayer', () => {
            // Get or create tool layer (convenience method for future tool integration)
            return this.getToolLayer(layerType) || this.createToolLayer(layerType);
        }, { layerType });
    }

    createLayer(name: string, parentId: string | null = null): Layer {
        return this.safeOperation('createLayer', () => {
            if (!name || name.trim() === '') {
                throw new Error('Layer name cannot be empty');
            }

            const id = this.generateLayerId();
            const parent = parentId ? this.layers.get(parentId) : null;

            if (parentId && !parent) {
                throw new Error(`Parent layer not found: ${parentId}`);
            }

            const layer: Layer = {
                id,
                name: name.trim(),
                parentId,
                properties: {
                    locked: false,
                    visible: true,
                    opacity: 1.0
                },
                children: [],
                primitiveIds: new Set()
            };

            if (parentId && parent) {
                layer.properties = { ...this.getEffectiveProperties(parentId), ...layer.properties };
                parent.children.push(layer);
            }

            this.layers.set(id, layer);
            console.log('✅ Layer created:', { id, name, parentId });
            this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
            return layer;
        }, { name, parentId });
    }

    deleteLayer(layerId: string): boolean {
        return this.safeOperation('deleteLayer', () => {
            if (this.PREDEFINED_LAYER_NAMES.DEFAULT === layerId) {
                throw new Error('Cannot delete Default layer');
            }

            const layer = this.layers.get(layerId);
            if (!layer) {
                throw new Error(`Layer not found: ${layerId}`);
            }

            const targetLayerId = layer.parentId || this.PREDEFINED_LAYER_NAMES.DEFAULT;
            this.transferPrimitives(layerId, targetLayerId);

            if (layer.parentId) {
                const parent = this.layers.get(layer.parentId);
                if (parent) {
                    parent.children = parent.children.filter(child => child.id !== layerId);
                }
            }

            layer.children.forEach(child => this.deleteLayer(child.id));
            this.layers.delete(layerId);
            
            if (this.activeLayerId === layerId) {
                this.activeLayerId = this.PREDEFINED_LAYER_NAMES.DEFAULT;
            }

            console.log('🗑️ Layer deleted:', layerId);
            this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
            return true;
        }, { layerId });
    }

    assignPrimitiveToLayer(primitiveId: string, layerId: string | null): boolean {
        return this.safeOperation('assignPrimitiveToLayer', () => {
            // Validate primitiveId
            if (!primitiveId || primitiveId.trim() === '') {
                throw new Error('Invalid primitiveId provided');
            }

            for (const layer of this.layers.values()) {
                if (layer.primitiveIds.has(primitiveId)) {
                    layer.primitiveIds.delete(primitiveId);
                }
            }

            if (layerId) {
                const layer = this.layers.get(layerId);
                if (!layer) {
                    // 🎯 IMPROVED: Provide helpful error with available layers
                    const availableLayers = Array.from(this.layers.keys());
                    throw new Error(
                        `Target layer not found: "${layerId}". Available layers: ${availableLayers.join(', ')}`
                    );
                }
                layer.primitiveIds.add(primitiveId);
            }
            
            this.notifyListeners(this.EVENT_TYPES.LAYERS_CHANGED);
            return true;
        }, { primitiveId, layerId });
    }

    getPrimitivesByLayer(layerId: string): string[] {
        return this.safeOperation('getPrimitivesByLayer', () => {
            const layer = this.layers.get(layerId);
            return layer ? Array.from(layer.primitiveIds) : [];
        }, { layerId });
    }

    getLayerByPrimitive(primitiveId: string): Layer | null {
        return this.safeOperation('getLayerByPrimitive', () => {
            for (const layer of this.layers.values()) {
                if (layer.primitiveIds.has(primitiveId)) {
                    return layer;
                }
            }
            return null;
        }, { primitiveId });
    }

    setActiveLayer(layerId: string | null): boolean {
        return this.safeOperation('setActiveLayer', () => {
            if (layerId && !this.layers.has(layerId)) {
                throw new Error(`Layer not found: ${layerId}`);
            }

            this.activeLayerId = layerId;
            console.log('🎯 Active layer set to:', layerId || 'None (orphaning)');
            this.notifyListeners(this.EVENT_TYPES.ACTIVE_LAYER_CHANGED);
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

    getEffectiveProperties(layerId: string): LayerProperties {
        return this.safeOperation('getEffectiveProperties', () => {
            const layer = this.layers.get(layerId);
            if (!layer) return this.getDefaultProperties();

            if (!layer.parentId) {
                return { ...layer.properties };
            }

            const parentProperties = this.getEffectiveProperties(layer.parentId);
            return {
                ...parentProperties,
                ...layer.properties
            };
        }, { layerId });
    }

    updateLayerProperties(layerId: string, updates: Partial<LayerProperties>): boolean {
        return this.safeOperation('updateLayerProperties', () => {
            const layer = this.layers.get(layerId);
            if (!layer) return false;

            layer.properties = { ...layer.properties, ...updates };
            console.log('⚙️ Layer properties updated:', { layerId, updates });
            this.notifyListeners(this.EVENT_TYPES.LAYER_PROPERTIES_CHANGED);
            return true;
        }, { layerId, updates });
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

    // Helpers
    private generateLayerId(): string {
        return `layer-${crypto.randomUUID()}`;
    }

    private getDefaultProperties(): LayerProperties {
        return {
            locked: false,
            visible: true,
            opacity: 1.0
        };
    }

    private transferPrimitives(fromLayerId: string, toLayerId: string): void {
        this.safeOperation('transferPrimitives', () => {
            const fromLayer = this.layers.get(fromLayerId);
            const toLayer = this.layers.get(toLayerId);
            
            if (!fromLayer || !toLayer) return;

            fromLayer.primitiveIds.forEach(primitiveId => {
                toLayer.primitiveIds.add(primitiveId);
            });
            fromLayer.primitiveIds.clear();
            
            console.log('🔄 Primitives transferred:', { from: fromLayerId, to: toLayerId, count: fromLayer.primitiveIds.size });
        }, { fromLayerId, toLayerId });
    }

    // Add method to get event types for external use
    getEventTypes() {
        return { ...this.EVENT_TYPES };
    }
}

export const layerService = new LayerService();
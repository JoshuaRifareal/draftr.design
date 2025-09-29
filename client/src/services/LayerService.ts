// services/LayerService.ts

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

    // Event system for layer changes
    private listeners: Set<() => void> = new Set();
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    private notifyListeners(): void {
        this.listeners.forEach(listener => listener());
    }

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

    // Layers API
    createToolLayer(layerType: 'text' | 'dimensions' | 'images'): Layer {
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
    }
    getToolLayer(layerType: 'text' | 'dimensions' | 'images'): Layer | undefined {
        const layerMap = {
            text: this.PREDEFINED_LAYER_NAMES.TEXT,
            dimensions: this.PREDEFINED_LAYER_NAMES.DIMENSIONS,
            images: this.PREDEFINED_LAYER_NAMES.IMAGES
        };

        return this.layers.get(layerMap[layerType]);
    }
    ensureToolLayer(layerType: 'text' | 'dimensions' | 'images'): Layer {
        // Get or create tool layer (convenience method for future tool integration)
        return this.getToolLayer(layerType) || this.createToolLayer(layerType);
    }
    createLayer(name: string, parentId: string | null = null): Layer {
        const id = this.generateLayerId();
        const parent = parentId ? this.layers.get(parentId) : null;

        const layer: Layer = {
            id,
            name,
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
        this.notifyListeners();
        return layer;
    }
    deleteLayer(layerId: string): boolean {
        if (this.PREDEFINED_LAYER_NAMES.DEFAULT === layerId) {
            console.warn('🚫 Cannot delete Default layer');
            return false;
        }

        const layer = this.layers.get(layerId);
        if (!layer) return false;

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
        this.notifyListeners();
        return true;
    }
    assignPrimitiveToLayer(primitiveId: string, layerId: string | null): boolean {
        for (const layer of this.layers.values()) {
            if (layer.primitiveIds.has(primitiveId)) {
                layer.primitiveIds.delete(primitiveId);
                // console.log('➖ Primitive removed from layer:', { primitiveId, fromLayer: layer.id });
            }
        }

        if (layerId) {
            const layer = this.layers.get(layerId);
            if (!layer) {
                console.warn('❌ Target layer not found:', layerId);
                return false;
            }
            layer.primitiveIds.add(primitiveId);
            // console.log('➕ Primitive assigned to layer:', { primitiveId, toLayer: layerId });
        } else {
            // console.log('👻 Primitive orphaned:', primitiveId);
        }
        this.notifyListeners();
        return true;
    }
    getPrimitivesByLayer(layerId: string): string[] {
        const layer = this.layers.get(layerId);
        return layer ? Array.from(layer.primitiveIds) : [];
    }
    getLayerByPrimitive(primitiveId: string): Layer | null {
        for (const layer of this.layers.values()) {
            if (layer.primitiveIds.has(primitiveId)) {
                return layer;
            }
        }
        return null;
    }
    setActiveLayer(layerId: string | null): boolean {
        if (layerId && !this.layers.has(layerId)) {
            console.warn('❌ Layer not found:', layerId);
            return false;
        }

        this.activeLayerId = layerId;
        console.log('🎯 Active layer set to:', layerId || 'None (orphaning)');
        this.notifyListeners();
        return true;
    }
    getActiveLayer(): Layer | null {
        return this.activeLayerId ? this.layers.get(this.activeLayerId) || null : null;
    }
    getActiveLayerId(): string | null {
        return this.activeLayerId;
    }
    getEffectiveProperties(layerId: string): LayerProperties {
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
    }
    updateLayerProperties(layerId: string, updates: Partial<LayerProperties>): boolean {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        layer.properties = { ...layer.properties, ...updates };
        console.log('⚙️ Layer properties updated:', { layerId, updates });
        this.notifyListeners();
        return true;
    }
    getLayerHierarchy(): Layer[] {
        return Array.from(this.layers.values()).filter(layer => !layer.parentId);
    }
    getLayer(id: string): Layer | undefined {
        return this.layers.get(id);
    }
    getAllLayers(): Layer[] {
        return Array.from(this.layers.values());
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
        const fromLayer = this.layers.get(fromLayerId);
        const toLayer = this.layers.get(toLayerId);
        
        if (!fromLayer || !toLayer) return;

        fromLayer.primitiveIds.forEach(primitiveId => {
            toLayer.primitiveIds.add(primitiveId);
        });
        fromLayer.primitiveIds.clear();
        
        console.log('🔄 Primitives transferred:', { from: fromLayerId, to: toLayerId, count: fromLayer.primitiveIds.size });
    }
}

export const layerService = new LayerService();
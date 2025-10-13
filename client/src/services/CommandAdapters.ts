// services/CommandAdapters.ts
import { appStateStore, type AppState } from './AppStateStore';
import type { DrawingPrimitive } from '../types/DraftrTypes';
import { layerService } from './LayerService';
import { getErrorMessage, safeSync } from '../utils/errorHandling';
import type { Point, ConstraintType } from '../types/ToolTypes';

let onLivePreviewUpdate: (() => void) | null = null;
type TransformMode = 'move' | 'scale' | 'rotate' | null;

// Add window type declaration at the top
declare global {
  interface Window {
    CommandAdapters: any;
    testCommandAdapters: any;
  }
}

interface InteractiveTransformState {
  mode: TransformMode;
  targetIds: string[];
  basePoint: Point | null;
  previewPoint: Point | null;
  originalPrimitives: Map<string, DrawingPrimitive>; // Store original state for preview
  originalTransforms: Map<string, any>; // For block instances
}

let interactiveState: InteractiveTransformState = {
  mode: null,
  targetIds: [],
  basePoint: null,
  previewPoint: null,
  originalPrimitives: new Map(),
  originalTransforms: new Map()
};


// 🎯 ADAPTERS FOR EXISTING COMMANDS
export const CommandAdapters = {

  setLivePreviewCallback: (callback: () => void) => {
    onLivePreviewUpdate = callback;
  },
    
  // 🎯 DRAWING COMMANDS with type-safe error handling
  drawLine: (primitive: DrawingPrimitive) => {
    const { error } = safeSync(() => {
      console.log('🎯 CommandAdapters.drawLine called', primitive.id);
      
      // 🎯 FIX: Check if we have an active layer to draw on
      const activeLayer = layerService.getActiveLayer();
      if (!activeLayer) {
        throw new Error('No active layer - cannot draw');
      }
      
      // 🎯 FIX: Check if active layer is actually a layer (not group/block)
      if (activeLayer.type !== 'layer') {
        throw new Error(`Cannot draw on ${activeLayer.type} - only on layers`);
      }

      // 🎯 FIX: Validate that the layer still exists in LayerService
      const layerExists = layerService.getLayer(activeLayer.id);
      if (!layerExists) {
        throw new Error(`Active layer no longer exists: ${activeLayer.id}`);
      }

      if (!primitive.id) {
        throw new Error('Primitive ID is required');
      }

      if (!primitive.data || primitive.data.length < 4) {
        throw new Error('Invalid primitive data');
      }

      appStateStore.executeCommand('draw-line', (state: AppState) => {
        // 🎯 FIX: Always use active layer, ignore primitive.layerId
        const layerId = activeLayer.id;
        const primitiveWithLayer = { ...primitive, layerId };
        
        console.log('➕ Adding primitive to active layer:', layerId);
        
        // Assign to active layer
        layerService.assignPrimitiveToLayer(primitiveWithLayer.id, layerId);
        
        return {
          ...state,
          primitives: [...state.primitives, primitiveWithLayer],
          currentStart: { x: primitive.data[2], y: primitive.data[3] }, // Continue from end point
          previewEnd: null
        };
      });
    });

    if (error) {
      console.error('🚨 CommandAdapters.drawLine failed:', error);
      throw new Error(error);
    }
  },

  drawRectangle: (primitive: DrawingPrimitive) => {
    const { error } = safeSync(() => {
      console.log('🎯 CommandAdapters.drawRectangle called', primitive.id);
      
      // 🎯 FIX: Check if we have an active layer to draw on
      const activeLayer = layerService.getActiveLayer();
      if (!activeLayer) {
        throw new Error('No active layer - cannot draw');
      }
      
      // 🎯 FIX: Check if active layer is actually a layer (not group/block)
      if (activeLayer.type !== 'layer') {
        throw new Error(`Cannot draw on ${activeLayer.type} - only on layers`);
      }

      // 🎯 FIX: Validate that the layer still exists in LayerService
      const layerExists = layerService.getLayer(activeLayer.id);
      if (!layerExists) {
        throw new Error(`Active layer no longer exists: ${activeLayer.id}`);
      }
      
      appStateStore.executeCommand('draw-rectangle', (state: AppState) => {
        // 🎯 FIX: Always use active layer, ignore primitive.layerId
        const layerId = activeLayer.id;
        const primitiveWithLayer = { ...primitive, layerId };
        
        layerService.assignPrimitiveToLayer(primitiveWithLayer.id, layerId);
        
        return {
          ...state,
          primitives: [...state.primitives, primitiveWithLayer],
          currentStart: null,
          previewEnd: null
        };
      });
    });

    if (error) {
      console.error('🚨 CommandAdapters.drawRectangle failed:', error);
      throw new Error(error);
    }
  },

  // 🎯 CONSTRAINT COMMANDS (non-undoable)
  setVertexConstraints: (constraints: Point[]) => {
    const { error } = safeSync(() => {
      appStateStore.updateTemporaryState({ vertexConstraints: constraints });
    });

    if (error) {
      console.error('🚨 CommandAdapters.setVertexConstraints failed:', error);
    }
  },

  addVertexConstraint: (vertex: Point) => {
    const { error } = safeSync(() => {
      const currentState = appStateStore.getState();
      const key = `${vertex.x.toFixed(4)},${vertex.y.toFixed(4)}`;
      const exists = currentState.vertexConstraints.some(v => 
        `${v.x.toFixed(4)},${v.y.toFixed(4)}` === key
      );
      
      if (exists) {
        // Remove if exists (toggle behavior)
        appStateStore.updateTemporaryState({
          vertexConstraints: currentState.vertexConstraints.filter(v => 
            `${v.x.toFixed(4)},${v.y.toFixed(4)}` !== key
          )
        });
      } else {
        // Add if new
        appStateStore.updateTemporaryState({
          vertexConstraints: [...currentState.vertexConstraints, vertex]
        });
      }
    });

    if (error) {
      console.error('🚨 CommandAdapters.addVertexConstraint failed:', error);
    }
  },

  clearVertexConstraints: () => {
    const { error } = safeSync(() => {
      appStateStore.updateTemporaryState({ vertexConstraints: [] });
    });

    if (error) {
      console.error('🚨 CommandAdapters.clearVertexConstraints failed:', error);
    }
  },

  setActiveConstraint: (constraint: {x: number, y: number; type: ConstraintType} | null) => {
    const { error } = safeSync(() => {
      appStateStore.updateTemporaryState({ activeConstraint: constraint });
    });

    if (error) {
      console.error('🚨 CommandAdapters.setActiveConstraint failed:', error);
    }
  },

  // 🎯 TOOL COMMANDS with type-safe error handling
  setActiveTool: (tool: string) => {
    const { error } = safeSync(() => {
      console.log('🎯 CommandAdapters.setActiveTool called', tool);
      
      appStateStore.executeCommand('set-tool', (state: AppState) => ({
        ...state,
        activeTool: tool,
        currentStart: null,
        previewEnd: null,
        selectionStart: null,
        selectionEnd: null
      }));
    });

    if (error) {
      console.error('🚨 CommandAdapters.setActiveTool failed:', error);
      throw new Error(error);
    }
  },

  setSelection: (selectedIds: string[]) => {
    const { error } = safeSync(() => {
      const startTime = performance.now();

      appStateStore.executeCommand('set-selection', (state: AppState) => ({
        ...state,
        selectedPrimitiveIds: selectedIds
      }));

      const endTime = performance.now();
      if (selectedIds.length === 0) {
        console.log(`🗑️ Cleared selection in ${(endTime - startTime).toFixed(2)}ms`);
      }
    });

    if (error) {
      console.error('🚨 CommandAdapters.setSelection failed:', error);
      throw new Error(error);
    }
  },

  // 🎯 NAVIGATION COMMANDS
  zoom: (newScale: number, newOffsetX: number, newOffsetY: number) => {
    const { error } = safeSync(() => {
      console.log('🎯 CommandAdapters.zoom called (debounced)', { newScale, newOffsetX, newOffsetY });
      
      // Use the debounced navigation command
      (appStateStore as any).executeNavigationCommand('zoom', (state: AppState) => ({
        ...state,
        scale: newScale,
        offsetX: newOffsetX,
        offsetY: newOffsetY
      }));
    });

    if (error) {
      console.error('🚨 CommandAdapters.zoom failed:', error);
    }
  },

  panImmediate: (newOffsetX: number, newOffsetY: number) => {
    const { error } = safeSync(() => {
      // This is temporary during panning - won't create undo points
      appStateStore.updateTemporaryState({
        offsetX: newOffsetX,
        offsetY: newOffsetY
      });
    });

    if (error) {
      console.error('🚨 CommandAdapters.panImmediate failed:', error);
    }
  },

  panFinal: (newOffsetX: number, newOffsetY: number) => {
    const { error } = safeSync(() => {
      (appStateStore as any).executeNavigationCommand('pan', (state: AppState) => ({
        ...state,
        offsetX: newOffsetX,
        offsetY: newOffsetY
      }));
    });

    if (error) {
      console.error('🚨 CommandAdapters.panFinal failed:', error);
    }
  },

  // 🎯 EDIT COMMANDS with type-safe error handling
  clearCanvas: () => {
    const { error } = safeSync(() => {
      console.log('🎯 CommandAdapters.clearCanvas called');
      
      appStateStore.executeCommand('clear-canvas', (state: AppState) => {
        // 🎯 FIX: Clear layer assignments directly
        console.log('🗑️ Clearing primitives from layers');
        state.primitives.forEach(primitive => {
          // Remove from layer directly
          if (primitive.layerId) {
            const layer = layerService.getLayer(primitive.layerId);
            if (layer && layer.primitiveIds.has(primitive.id)) {
              layer.primitiveIds.delete(primitive.id);
            }
          }
        });
        
        // Clear selection service directly
        if (typeof (window as any).selectionService !== 'undefined') {
          (window as any).selectionService.clearAll();
        }
        
        return {
          ...state,
          primitives: [],
          selectedPrimitiveIds: []
        };
      });
    });

    if (error) {
      console.error('🚨 CommandAdapters.clearCanvas failed:', error);
      throw new Error(error);
    }
  },

  deleteSelected: (selectedIds: string[]) => {
    const { error } = safeSync(() => {
      console.log('🎯 CommandAdapters.deleteSelected called', selectedIds);
      
      appStateStore.executeCommand('delete-selected', (state: AppState) => {
        // Remove from layers
        selectedIds.forEach(id => {
          const primitive = state.primitives.find(p => p.id === id);
          if (primitive && primitive.layerId) {
            const layer = layerService.getLayer(primitive.layerId);
            if (layer && layer.primitiveIds.has(id)) {
              layer.primitiveIds.delete(id);
            }
          }
        });
        
        // 🎯 FIX: Actually remove primitives from state, not just from layers
        const newPrimitives = state.primitives.filter(p => !selectedIds.includes(p.id));
        console.log(`🗑️ Deleted ${selectedIds.length} primitives, ${newPrimitives.length} remaining`);
        
        return {
          ...state,
          primitives: newPrimitives, // 🎯 This is the key fix!
          selectedPrimitiveIds: []
        };
      });
    });

    if (error) {
      console.error('🚨 CommandAdapters.deleteSelected failed:', error);
      throw new Error(error);
    }
  },

  // 🎯 UTILITY: Update preview (non-undoable)
  updatePreview: (previewEnd: Point | null) => {
    const { error } = safeSync(() => {
      appStateStore.updateTemporaryState({ previewEnd });
    });

    if (error) {
      console.error('🚨 CommandAdapters.updatePreview failed:', error);
    }
  },

  updateCurrentStart: (currentStart: Point | null) => {
    const { error } = safeSync(() => {
      appStateStore.updateTemporaryState({ currentStart });
    });

    if (error) {
      console.error('🚨 CommandAdapters.updateCurrentStart failed:', error);
    }
  },

  updateSelectionRect: (start: Point | null, end: Point | null) => {
    const { error } = safeSync(() => {
      appStateStore.updateTemporaryState({ 
        selectionStart: start, 
        selectionEnd: end 
      });
    });

    if (error) {
      console.error('🚨 CommandAdapters.updateSelectionRect failed:', error);
    }
  },


  // TRANSFORM COMMANDS

};




// 🎯 Export for browser testing
if (typeof window !== 'undefined') {
  (window as any).CommandAdapters = CommandAdapters;
  console.log('✅ CommandAdapters exposed to window');
  
  // Add test function
  (window as any).testCommandAdapters = () => {
    console.log('🧪 Testing CommandAdapters...');
    
    if (!(window as any).CommandAdapters) {
      console.error('❌ CommandAdapters not found on window');
      return false;
    }
    
    try {
      const adapters = (window as any).CommandAdapters;
      
      // Test 1: Tool change
      console.log('📋 Test 1: Tool change');
      adapters.setActiveTool('LINE');
      console.log('Tool set to:', (window as any).appStateStore.getState().activeTool);
      
      // Test 2: Selection
      console.log('📋 Test 2: Selection');
      adapters.setSelection(['test-1', 'test-2']);
      console.log('Selection:', (window as any).appStateStore.getState().selectedPrimitiveIds);
      
      // Test 3: Drawing (simulated)
      console.log('📋 Test 3: Drawing simulation');
      const testPrimitive: DrawingPrimitive = {
        id: 'adapter-test-line',
        type: 'line',
        data: [0, 0, 100, 100, 1, 1, 1, 1],
        layerId: 'Default'
      };
      adapters.drawLine(testPrimitive);
      console.log('After draw - Primitives:', (window as any).appStateStore.getState().primitives.length);
      
      // Test 4: Undo chain
      console.log('📋 Test 4: Undo chain');
      (window as any).appStateStore.undo(); // Undo drawing
      console.log('After undo drawing:', (window as any).appStateStore.getState().primitives.length);
      
      (window as any).appStateStore.undo(); // Undo selection
      console.log('After undo selection:', (window as any).appStateStore.getState().selectedPrimitiveIds.length);
      
      (window as any).appStateStore.undo(); // Undo tool change
      console.log('After undo tool:', (window as any).appStateStore.getState().activeTool);
      
      // Test 5: Redo chain
      console.log('📋 Test 5: Redo chain');
      (window as any).appStateStore.redo(); // Redo tool
      console.log('After redo tool:', (window as any).appStateStore.getState().activeTool);
      
      (window as any).appStateStore.redo(); // Redo selection
      console.log('After redo selection:', (window as any).appStateStore.getState().selectedPrimitiveIds.length);
      
      (window as any).appStateStore.redo(); // Redo drawing
      console.log('After redo drawing:', (window as any).appStateStore.getState().primitives.length);
      
      console.log('🎉 CommandAdapters tests passed!');
      return true;
      
    } catch (error) {
      console.error('❌ CommandAdapters test failed:', error);
      return false;
    }
  };
}
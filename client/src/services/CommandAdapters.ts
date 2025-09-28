// services/CommandAdapters.ts
import { appStateStore, type AppState } from './AppStateStore';
import type { DrawingPrimitive } from '../types/draftrTypes';
import { layerService } from './LayerService';

// Add window type declaration at the top
declare global {
  interface Window {
    CommandAdapters: any;
    testCommandAdapters: any;
  }
}

// 🎯 ADAPTERS FOR EXISTING COMMANDS
export const CommandAdapters = {
    
  // 🎯 DRAWING COMMANDS
  drawLine: (primitive: DrawingPrimitive) => {
    console.log('🎯 CommandAdapters.drawLine called', primitive.id);
    
    appStateStore.executeCommand('draw-line', (state: AppState) => {
      // Assign to current layer
      const layerId = primitive.layerId || layerService.getActiveLayerId();
      const primitiveWithLayer = { ...primitive, layerId };
      
      console.log('➕ Adding primitive to layer:', layerId);
      layerService.assignPrimitiveToLayer(primitiveWithLayer.id, layerId);
      
      return {
        ...state,
        primitives: [...state.primitives, primitiveWithLayer],
        currentStart: { x: primitive.data[2], y: primitive.data[3] }, // Continue from end point
        previewEnd: null
      };
    });
  },
  drawRectangle: (primitive: DrawingPrimitive) => {
    console.log('🎯 CommandAdapters.drawRectangle called', primitive.id);
    
    appStateStore.executeCommand('draw-rectangle', (state: AppState) => {
      const layerId = primitive.layerId || layerService.getActiveLayerId();
      const primitiveWithLayer = { ...primitive, layerId };
      
      layerService.assignPrimitiveToLayer(primitiveWithLayer.id, layerId);
      
      return {
        ...state,
        primitives: [...state.primitives, primitiveWithLayer],
        currentStart: null,
        previewEnd: null
      };
    });
  },

  // 🎯 CONSTRAINT COMMANDS (non-undoable)
  setVertexConstraints: (constraints: {x: number, y: number}[]) => {
    appStateStore.updateTemporaryState({ vertexConstraints: constraints });
  },
  addVertexConstraint: (vertex: {x: number, y: number}) => {
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
  },
  clearVertexConstraints: () => {
    appStateStore.updateTemporaryState({ vertexConstraints: [] });
  },
  setActiveConstraint: (constraint: {x: number, y: number, type: 'horizontal' | 'vertical'} | null) => {
    appStateStore.updateTemporaryState({ activeConstraint: constraint });
  },

  // 🎯 TOOL COMMANDS
  setActiveTool: (tool: string) => {
    console.log('🎯 CommandAdapters.setActiveTool called', tool);
    
    appStateStore.executeCommand('set-tool', (state: AppState) => ({
      ...state,
      activeTool: tool,
      currentStart: null,
      previewEnd: null,
      selectionStart: null,
      selectionEnd: null
    }));
  },

  // 🎯 SELECTION COMMANDS
  setSelection: (selectedIds: string[]) => {
    console.log('🎯 CommandAdapters.setSelection called', selectedIds);
    
    appStateStore.executeCommand('set-selection', (state: AppState) => ({
      ...state,
      selectedPrimitiveIds: selectedIds
    }));
  },

  // 🎯 NAVIGATION COMMANDS
  zoom: (newScale: number, newOffsetX: number, newOffsetY: number) => {
    console.log('🎯 CommandAdapters.zoom called (debounced)', { newScale, newOffsetX, newOffsetY });
    
    // Use the debounced navigation command
    (appStateStore as any).executeNavigationCommand('zoom', (state: AppState) => ({
      ...state,
      scale: newScale,
      offsetX: newOffsetX,
      offsetY: newOffsetY
    }));
  },
  panImmediate: (newOffsetX: number, newOffsetY: number) => {
    // This is temporary during panning - won't create undo points
    appStateStore.updateTemporaryState({
      offsetX: newOffsetX,
      offsetY: newOffsetY
    });
  },
  panFinal: (newOffsetX: number, newOffsetY: number) => {
    (appStateStore as any).executeNavigationCommand('pan', (state: AppState) => ({
      ...state,
      offsetX: newOffsetX,
      offsetY: newOffsetY
    }));
  },

  // 🎯 EDIT COMMANDS
  clearCanvas: () => {
    console.log('🎯 CommandAdapters.clearCanvas called');
    
    appStateStore.executeCommand('clear-canvas', (state: AppState) => {
      // Clear layer assignments
      console.log('🗑️ Clearing primitives from layers');
      state.primitives.forEach(primitive => {
        layerService.assignPrimitiveToLayer(primitive.id, null);
      });
      
      return {
        ...state,
        primitives: [],
        selectedPrimitiveIds: []
      };
    });
  },
  deleteSelected: (selectedIds: string[]) => {
    console.log('🎯 CommandAdapters.deleteSelected called', selectedIds);
    
    appStateStore.executeCommand('delete-selected', (state: AppState) => {
      // Remove from layers
      selectedIds.forEach(id => {
        layerService.assignPrimitiveToLayer(id, null);
      });
      
      const newPrimitives = state.primitives.filter(p => !selectedIds.includes(p.id));
      console.log(`🗑️ Deleted ${selectedIds.length} primitives, ${newPrimitives.length} remaining`);
      
      return {
        ...state,
        primitives: newPrimitives,
        selectedPrimitiveIds: []
      };
    });
  },

  // 🎯 UTILITY: Update preview (non-undoable)
  updatePreview: (previewEnd: { x: number; y: number } | null) => {
    appStateStore.updateTemporaryState({ previewEnd });
  },
  updateCurrentStart: (currentStart: { x: number; y: number } | null) => {
    appStateStore.updateTemporaryState({ currentStart });
  },
  updateSelectionRect: (start: { x: number; y: number } | null, end: { x: number; y: number } | null) => {
    appStateStore.updateTemporaryState({ 
      selectionStart: start, 
      selectionEnd: end 
    });
  }

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
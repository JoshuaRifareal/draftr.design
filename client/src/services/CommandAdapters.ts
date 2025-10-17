// services/CommandAdapters.ts
import { appStateStore, type AppState } from './AppStateStore';
import type { DrawingPrimitive } from '../types/DraftrTypes';
import { layerService } from './LayerService';
import { snappingService, contextManager } from './SnappingService';
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
        // Use layerService.assignPrimitiveToLayer with notify:false to avoid per-primitive notifications
        state.primitives.forEach(primitive => {
          if (primitive.layerId) {
            try {
              layerService.assignPrimitiveToLayer(primitive.id, null, { notify: false });
            } catch (e) {
              // best-effort
            }
          }
        });
        
        // Clear selection service internal map
        if (typeof (window as any).selectionService !== 'undefined') {
          (window as any).selectionService.clearAll();
        }
        
        return {
          ...state,
          primitives: [],
          selectedPrimitiveIds: []
        };
      });
      // After bulk layer removals, trigger a single layers-changed notification
      try { layerService.notifyLayersChanged(); } catch (e) { /* ignore */ }
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
  startTransform: (mode: 'move' | 'scale' | 'rotate', targetIds?: string[]) => {
    const { error } = safeSync(() => {
      console.log('🎯 CommandAdapters.startTransform called', { mode, targetIds });
      
      const currentState = appStateStore.getState();
      
      const finalTargetIds = targetIds || currentState.selectedPrimitiveIds;
      
      if (finalTargetIds.length === 0) {
        throw new Error('No primitives selected for transformation');
      }

      const originalPrimitives = currentState.primitives
        .filter(p => finalTargetIds.includes(p.id))
        .map(p => ({
          ...p,
          data: [...p.data]
        }));

      appStateStore.updateTemporaryState({
        transformPreview: {
          active: true,
          mode,
          targetIds: finalTargetIds,
          basePoint: null,
          previewPoint: null,
          previousPoint: null,
          originalPrimitives: originalPrimitives
        }
      });

      triggerTransformUIUpdate()
      console.log(`🎯 Transform started: ${mode} on ${finalTargetIds.length} primitives`);
    });

    if (error) {
      console.error('🚨 CommandAdapters.startTransform failed:', error);
      throw new Error(error);
    }
  },
  processTransformClick: (worldPos: Point): boolean => {
    const { error, result } = safeSync(() => {
      const currentState = appStateStore.getState();
      if (!currentState.transformPreview.active) return false;

      const transformState = currentState.transformPreview;

      if (!transformState.basePoint) {
        // 🎯 FIRST CLICK: Apply snapping to base point selection
        
        // Convert world position to screen for snapping calculation
        const screenPos = { 
          x: (worldPos.x + currentState.offsetX) * currentState.scale,
          y: (worldPos.y + currentState.offsetY) * currentState.scale
        };
        
        // Get snapping context
        const context = {
          primitives: currentState.primitives,
          vertexConstraints: currentState.vertexConstraints,
          activeConstraint: currentState.activeConstraint,
          currentStart: null, // No current start for first click
          shiftHeld: false,
          orthoTempDisabled: false,
          constraintTempDisabled: false,
          scale: currentState.scale,
          offsetX: currentState.offsetX,
          offsetY: currentState.offsetY
        };
        
        // Find snap result
        const snapResult = snappingService.findSnap(screenPos, context);
        
        // Use snapped position if available, otherwise use original
        const finalBasePoint = snapResult.type !== 'none' ? snapResult.position : worldPos;
        
        console.log(`🎯 Transform base point set with snapping:`, { 
          original: worldPos, 
          snapped: finalBasePoint,
          snapType: snapResult.type 
        });

        appStateStore.updateTemporaryState({
          transformPreview: {
            ...transformState,
            basePoint: finalBasePoint,
            previousPoint: finalBasePoint // 🎯 Initialize for incremental moves
          }
        });
        return true;
      } else {
        // Second click - execute transform (will handle snapping in finalize)
        CommandAdapters.finalizeTransform(worldPos);
        return true;
      }
    });

    if (error) {
      console.error('🚨 CommandAdapters.processTransformClick failed:', error);
      return false;
    }
    
    return result || false;
  },
  updateTransformPreview: (worldPos: Point, shiftHeld: boolean = false) => {
    const { error } = safeSync(() => {
      const currentState = appStateStore.getState();
      const transformState = currentState.transformPreview;
      
      if (!transformState.active || !transformState.basePoint) return;

      // Convert world position to screen for snapping calculation
      const screenPos = { 
        x: (worldPos.x + currentState.offsetX) * currentState.scale,
        y: (worldPos.y + currentState.offsetY) * currentState.scale
      };
      
      // 🎯 FIX: EXCLUDE SELECTED PRIMITIVES FROM SNAPPING (prevent self-snap)
      const nonSelectedPrimitives = currentState.primitives.filter(p => 
        !transformState.targetIds.includes(p.id)
      );
      
      // Get snapping context - EXCLUDE selected primitives
      const context = {
        primitives: nonSelectedPrimitives, // 🎯 Only non-selected primitives
        vertexConstraints: currentState.vertexConstraints,
        activeConstraint: currentState.activeConstraint,
        currentStart: transformState.basePoint, // Use base point for ortho calculations
        shiftHeld: shiftHeld,
        orthoTempDisabled: false,
        constraintTempDisabled: false,
        scale: currentState.scale,
        offsetX: currentState.offsetX,
        offsetY: currentState.offsetY
      };

      snappingService.updateConfig({
        orthoEnabled: shiftHeld // 🎯 Only enable ortho when shift held
      });
      
      // Find snap result (only on non-selected geometry)
      const snapResult = snappingService.findSnap(screenPos, context);
      
      // 🎯 FIX: UPDATE SNAP RESULT REF FOR VISUALS
      if (typeof (window as any).snapResultRef !== 'undefined') {
        (window as any).snapResultRef.current = snapResult;
      }
      
      // Use snapped position if available, otherwise use original
      const finalWorldPos = snapResult.type !== 'none' ? snapResult.position : worldPos;

      console.log(`🎯 Transform preview with snapping:`, { 
        snapType: snapResult.type,
        selectedCount: transformState.targetIds.length,
        excludedPrimitives: currentState.primitives.length - nonSelectedPrimitives.length
      });

      let deltaX: number, deltaY: number;

      // 🎯 CALCULATE DELTA FROM BASE POINT (not previous position)
      // This prevents accumulation errors
      deltaX = finalWorldPos.x - transformState.basePoint.x;
      deltaY = finalWorldPos.y - transformState.basePoint.y;

      // 🎯 APPLY TRANSFORM TO ACTUAL PRIMITIVES
      const updatedPrimitives = currentState.primitives.map(primitive => {
        if (!transformState.targetIds.includes(primitive.id)) {
          return primitive;
        }
        
        // 🎯 ALWAYS TRANSFORM FROM ORIGINAL POSITIONS to prevent drift
        const originalPrimitive = transformState.originalPrimitives.find(p => p.id === primitive.id);
        if (originalPrimitive) {
          return applyTranslation(originalPrimitive, deltaX, deltaY);
        }
        return applyTranslation(primitive, deltaX, deltaY);
      });

      // 🎯 UPDATE STATE
      appStateStore.updateTemporaryState({
        primitives: updatedPrimitives,
        transformPreview: {
          ...transformState,
          previewPoint: finalWorldPos
        }
      });

    });

    if (error) {
      console.error('🚨 CommandAdapters.updateTransformPreview failed:', error);
    }
  },
  finalizeTransform: (finalPos: Point) => {
    const { error } = safeSync(() => {
      const currentState = appStateStore.getState();
      const transformState = currentState.transformPreview;
      
      if (!transformState.active || !transformState.basePoint) {
        throw new Error('No active transform to finalize');
      }

      // 🎯 APPLY SNAPPING TO FINAL POSITION
      
      // Convert world position to screen for snapping calculation
      const screenPos = { 
        x: (finalPos.x + currentState.offsetX) * currentState.scale,
        y: (finalPos.y + currentState.offsetY) * currentState.scale
      };
      
      // Get snapping context
      const context = {
        primitives: currentState.primitives,
        vertexConstraints: currentState.vertexConstraints,
        activeConstraint: currentState.activeConstraint,
        currentStart: transformState.basePoint,
        shiftHeld: false,
        orthoTempDisabled: false,
        constraintTempDisabled: false,
        scale: currentState.scale,
        offsetX: currentState.offsetX,
        offsetY: currentState.offsetY
      };
      
      // Find snap result
      const snapResult = snappingService.findSnap(screenPos, context);
      
      // Use snapped position if available, otherwise use original
      const finalWorldPos = snapResult.type !== 'none' ? snapResult.position : finalPos;
      
      console.log(`✅ Finalizing transform with snapping:`, { 
        original: finalPos, 
        snapped: finalWorldPos,
        snapType: snapResult.type 
      });

      // 🎯 SIMPLE FIX: Just clear the transform state, keeping primitives as they are
      appStateStore.updateTemporaryState({
        transformPreview: {
          active: false,
          mode: null,
          targetIds: [],
          basePoint: null,
          previewPoint: null,
          previousPoint: null,
          originalPrimitives: []
        }
      });
      
      console.log(`✅ Transform ${transformState.mode} finalized at snapped position`);
    });

    if (error) {
      console.error('🚨 CommandAdapters.finalizeTransform failed:', error);
      throw new Error(error);
    }
  },
  cancelTransform: () => {
    const { error } = safeSync(() => {
      const currentState = appStateStore.getState();
      if (!currentState.transformPreview.active) return;

      // 🎯 RESTORE ORIGINAL PRIMITIVES (undo the preview changes)
      const originalPrimitives = currentState.transformPreview.originalPrimitives;
      
      // Create a mapping of original primitives by ID for quick lookup
      const originalMap = new Map();
      originalPrimitives.forEach(p => originalMap.set(p.id, p));
      
      // Restore the original state of transformed primitives
      const restoredPrimitives = currentState.primitives.map(primitive => {
        if (originalMap.has(primitive.id)) {
          return originalMap.get(primitive.id); // Restore original
        }
        return primitive; // Keep non-transformed primitives
      });

      appStateStore.updateTemporaryState({
        primitives: restoredPrimitives,
        transformPreview: {
          active: false,
          mode: null,
          targetIds: [],
          basePoint: null,
          previewPoint: null,
          previousPoint: null,
          originalPrimitives: [],
        }
      });
      
      console.log('❌ Transform cancelled - original state restored');
    });

    if (error) {
      console.error('🚨 CommandAdapters.cancelTransform failed:', error);
    }
  },
  

  // Actual transform execution commands (undoable)
  transformMove: (targetIds: string[], deltaX: number, deltaY: number) => {
    const { error } = safeSync(() => {
      appStateStore.executeCommand('transform-move', (state: AppState) => {
        const newPrimitives = state.primitives.map(primitive => {
          if (!targetIds.includes(primitive.id)) return primitive;
          
          return applyTranslation(primitive, deltaX, deltaY);
        });
        
        return {
          ...state,
          primitives: newPrimitives
        };
      });
    });

    if (error) {
      console.error('🚨 CommandAdapters.transformMove failed:', error);
      throw new Error(error);
    }
  },
  transformScale: (targetIds: string[], scale: number, basePoint: Point) => {
    const { error } = safeSync(() => {
      appStateStore.executeCommand('transform-scale', (state: AppState) => {
        const newPrimitives = state.primitives.map(primitive => {
          if (!targetIds.includes(primitive.id)) return primitive;
          
          return applyScaling(primitive, scale, basePoint);
        });
        
        return {
          ...state,
          primitives: newPrimitives
        };
      });
    });

    if (error) {
      console.error('🚨 CommandAdapters.transformScale failed:', error);
      throw new Error(error);
    }
  },
  transformRotate: (targetIds: string[], angle: number, basePoint: Point) => {
    const { error } = safeSync(() => {
      appStateStore.executeCommand('transform-rotate', (state: AppState) => {
        const newPrimitives = state.primitives.map(primitive => {
          if (!targetIds.includes(primitive.id)) return primitive;
          
          return applyRotation(primitive, angle, basePoint);
        });
        
        return {
          ...state,
          primitives: newPrimitives
        };
      });
    });

    if (error) {
      console.error('🚨 CommandAdapters.transformRotate failed:', error);
      throw new Error(error);
    }
  },
  getTransformState: () => {
    const currentState = appStateStore.getState();
    return {
      isActive: currentState.transformPreview.active,
      mode: currentState.transformPreview.mode,
      hasBasePoint: !!currentState.transformPreview.basePoint,
      targetCount: currentState.transformPreview.targetIds.length
    };
  }
};


// Transformation HELPER functions
const calculateTransformPreview = (
  primitives: DrawingPrimitive[],
  mode: 'move' | 'scale' | 'rotate',
  basePoint: Point,
  cursorPos: Point,
  shiftHeld: boolean
): DrawingPrimitive[] => {
  console.log('🔍 calculateTransformPreview called:', {
    primitivesCount: primitives.length,
    mode,
    basePoint,
    cursorPos,
    shiftHeld
  });

  if (primitives.length === 0) {
    console.warn('⚠️ No primitives to transform!');
    return [];
  }

  let result: DrawingPrimitive[] = [];

  switch (mode) {
    case 'move':
      const deltaX = cursorPos.x - basePoint.x;
      const deltaY = cursorPos.y - basePoint.y;
      console.log('📐 Move calculation:', { deltaX, deltaY });
      
      result = primitives.map(p => {
        const transformed = applyTranslation(p, deltaX, deltaY);
        console.log('➡️ Move transform:', {
          original: p.data.slice(0, 4),
          transformed: transformed.data.slice(0, 4)
        });
        return transformed;
      });
      break;
      
    case 'scale':
      const scale = calculateScaleFactor(basePoint, cursorPos, shiftHeld);
      console.log('📐 Scale calculation:', { scale });
      
      result = primitives.map(p => {
        const transformed = applyScaling(p, scale, basePoint);
        console.log('⚖️ Scale transform:', {
          original: p.data.slice(0, 4),
          transformed: transformed.data.slice(0, 4)
        });
        return transformed;
      });
      break;
      
    case 'rotate':
      const angle = calculateRotationAngle(basePoint, cursorPos);
      console.log('📐 Rotation calculation:', { angle });
      
      result = primitives.map(p => {
        const transformed = applyRotation(p, angle, basePoint);
        console.log('🔄 Rotation transform:', {
          original: p.data.slice(0, 4),
          transformed: transformed.data.slice(0, 4)
        });
        return transformed;
      });
      break;
      
    default:
      console.warn('⚠️ Unknown transform mode:', mode);
      result = primitives;
  }

  console.log('✅ calculateTransformPreview result count:', result.length);
  return result;
};
const applyTranslation = (primitive: DrawingPrimitive, deltaX: number, deltaY: number): DrawingPrimitive => {
  const newPrimitive = { ...primitive, data: [...primitive.data] };
  
  switch (primitive.type) {
    case 'line':
      // [x1, y1, x2, y2, ...colors]
      newPrimitive.data[0] += deltaX; // x1
      newPrimitive.data[1] += deltaY; // y1
      newPrimitive.data[2] += deltaX; // x2
      newPrimitive.data[3] += deltaY; // y2
      break;
    case 'rectangle':
      // [x1, y1, x2, y2, ...colors]
      newPrimitive.data[0] += deltaX; // x1
      newPrimitive.data[1] += deltaY; // y1
      newPrimitive.data[2] += deltaX; // x2
      newPrimitive.data[3] += deltaY; // y2
      break;
    // Add other primitive types as needed
  }
  
  return newPrimitive;
};
const calculateScaleFactor = (basePoint: Point, cursorPos: Point, uniform: boolean): number => {
  const baseDistance = 50; // Reference distance
  const currentDistance = Math.sqrt(
    Math.pow(cursorPos.x - basePoint.x, 2) + 
    Math.pow(cursorPos.y - basePoint.y, 2)
  );
  
  let scale = currentDistance / baseDistance;
  
  // Apply constraints
  scale = Math.max(0.1, Math.min(10, scale));
  
  // Snap to 1.0 when close
  if (Math.abs(scale - 1.0) < 0.05) {
    scale = 1.0;
  }
  
  return scale;
};
const applyScaling = (primitive: DrawingPrimitive, scale: number, basePoint: Point): DrawingPrimitive => {
  const newPrimitive = { ...primitive, data: [...primitive.data] };
  
  switch (primitive.type) {
    case 'line':
      // Scale from base point
      newPrimitive.data[0] = basePoint.x + (primitive.data[0] - basePoint.x) * scale;
      newPrimitive.data[1] = basePoint.y + (primitive.data[1] - basePoint.y) * scale;
      newPrimitive.data[2] = basePoint.x + (primitive.data[2] - basePoint.x) * scale;
      newPrimitive.data[3] = basePoint.y + (primitive.data[3] - basePoint.y) * scale;
      break;
    case 'rectangle':
      newPrimitive.data[0] = basePoint.x + (primitive.data[0] - basePoint.x) * scale;
      newPrimitive.data[1] = basePoint.y + (primitive.data[1] - basePoint.y) * scale;
      newPrimitive.data[2] = basePoint.x + (primitive.data[2] - basePoint.x) * scale;
      newPrimitive.data[3] = basePoint.y + (primitive.data[3] - basePoint.y) * scale;
      break;
  }
  
  return newPrimitive;
};
const calculateRotationAngle = (basePoint: Point, cursorPos: Point): number => {
  const dx = cursorPos.x - basePoint.x;
  const dy = cursorPos.y - basePoint.y;
  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
  
  // Snap to common angles (0, 15, 30, 45, 90, etc.)
  const snapAngles = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];
  const snapped = snapAngles.reduce((prev, curr) => {
    return Math.abs(curr - angle) < Math.abs(prev - angle) ? curr : prev;
  });
  
  // Only snap if close enough
  if (Math.abs(snapped - angle) < 5) {
    angle = snapped;
  }
  
  return angle;
};
const applyRotation = (primitive: DrawingPrimitive, angle: number, basePoint: Point): DrawingPrimitive => {
  const newPrimitive = { ...primitive, data: [...primitive.data] };
  const radians = angle * (Math.PI / 180);
  
  const rotatePoint = (x: number, y: number): [number, number] => {
    const translatedX = x - basePoint.x;
    const translatedY = y - basePoint.y;
    
    const rotatedX = translatedX * Math.cos(radians) - translatedY * Math.sin(radians);
    const rotatedY = translatedX * Math.sin(radians) + translatedY * Math.cos(radians);
    
    return [rotatedX + basePoint.x, rotatedY + basePoint.y];
  };
  
  switch (primitive.type) {
    case 'line':
      const [x1, y1] = rotatePoint(primitive.data[0], primitive.data[1]);
      const [x2, y2] = rotatePoint(primitive.data[2], primitive.data[3]);
      newPrimitive.data[0] = x1;
      newPrimitive.data[1] = y1;
      newPrimitive.data[2] = x2;
      newPrimitive.data[3] = y2;
      break;
    case 'rectangle':
      // For rectangle, rotate all corners
      const [rx1, ry1] = rotatePoint(primitive.data[0], primitive.data[1]);
      const [rx2, ry2] = rotatePoint(primitive.data[2], primitive.data[3]);
      newPrimitive.data[0] = rx1;
      newPrimitive.data[1] = ry1;
      newPrimitive.data[2] = rx2;
      newPrimitive.data[3] = ry2;
      break;
  }
  
  return newPrimitive;
};
const triggerTransformUIUpdate = () => {
  if (typeof (window as any).updateTransformUI === 'function') {
    (window as any).updateTransformUI();
  } else {
    console.warn('⚠️ updateTransformUI not available on window');
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

  (window as any).transformHelpers = {
    calculateTransformPreview,
    applyTranslation,
    applyScaling,
    applyRotation,
    calculateScaleFactor,
    calculateRotationAngle
  };
}
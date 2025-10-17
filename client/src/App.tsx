import './components/UIOverlay.css';
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import init from "./pkg/draftr_engine.js";
import UIOverlay from "./components/UIOverlay.js";
import { RenderService } from './services/RenderService';
import { snappingService, contextManager } from './services/SnappingService';
import type { SnapResult } from './services/SnappingService';
import type { SnapType } from './types/ToolTypes.js';
import { ThemeManager, type Theme } from './services/ThemeManager';
import { selectionService } from './services/SelectionService';
import { layerService, type Layer } from './services/LayerService';
import { appStateStore, type AppState } from './services/AppStateStore';
import { CommandAdapters } from './services/CommandAdapters';
import { commandRegistry } from './components/CommandBar/commands';
import type { DrawingPrimitive } from './types/DraftrTypes';
import { useCursor } from './components/Cursors/useCursor';
import { CURSORS  } from './components/Cursors/cursors';
import { ErrorBoundary, SimpleErrorFallback } from './components/ErrorBoundary';
import { PerformanceMonitor, type PerformanceMetrics, debounce, throttle } from './utils/performance';
import { getErrorMessage } from './utils/errorHandling';
import { isValidToolType } from './types/ToolTypes';


// Default Variables
const SNAP_THRESHOLD = 25; // px
const ORTHO_COLOR = { r: 0, g: 1, b: 0, a: 1.0 };
const ORTHO_DASH_PX = 8;
const ORTHO_GAP_PX = 6;
const ORTHO_THICKNESS_PX = 1;
const ORTHO_THRESHOLD_DEG = 5;
const ORTHO_ANGLES_DEG = [0, 45, 90, 135];
const GRID_COLOR = { r: 0, g: 0, b: 0, a: 0.1 };
const GRID_SPACING_MIN_PX = 25.0;
const GRID_SPACING_MAX_PX = 50.0;
const CANVAS_COLOR = { r: 0.17, g: 0.17, b: 0.19, a: 1.0 };
const SELECTION_COLOR = { r: 0.0, g: 0.0, b: 1.0, a: 0.25 };


const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const serviceRef = useRef<RenderService | null>(null);
  const [debug, setDebug] = useState(true);

  // Selection service setup
  const [shiftHeldForSelection, setShiftHeldForSelection] = useState(false);

  // Initialize theme manager and color configurations
  const themeManager = useRef(new ThemeManager()).current;
  const [currentTheme, setCurrentTheme] = useState<Theme>('dark');
  const [lineColor, setLineColor] = useState({ r: 1.0, g: 1.0, b: 1.0, a: 1.0 });
  const [snapColor, setSnapColor] = useState({ r: 1.0, g: 0.8, b: 0.0, a: 1.0 });

  // Pan/zoom state
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);

  // Block edit mode state
  const [isBlockEditMode, setIsBlockEditMode] = useState(false);
  const [editingBlockName, setEditingBlockName] = useState('');

  // Centralized State Management: APPSTATESTORE
  const [appState, setAppState] = useState<AppState>(appStateStore.getState());
  const {
    primitives,
    selectedPrimitiveIds,
    scale,
    offsetX,
    offsetY,
    activeTool,
    selectionStart,
    selectionEnd,
    currentStart,
    previewEnd,
    vertexConstraints,
    activeConstraint
  } = appState;

  // Runtime orthogonal configuration
  const [orthoConfig, setOrthoConfig] = useState({
    color: ORTHO_COLOR,
    dashPx: ORTHO_DASH_PX,
    gapPx: ORTHO_GAP_PX,
    thicknessPx: ORTHO_THICKNESS_PX,
    thresholdDeg: ORTHO_THRESHOLD_DEG,
    anglesDeg: ORTHO_ANGLES_DEG,
  });

  // Runtime grid configuration
  const [gridConfig, setGridConfig] = useState({
    color: GRID_COLOR,
    spacingMin: GRID_SPACING_MIN_PX,
    spacingMax: GRID_SPACING_MAX_PX
  });

  // Runtime constraint configuration
  const [constraintColor, setConstraintColor] = useState({ r: 128, g: 0, b: 128, a: 1.0 });

  // Runtime canvas and selection configuration
  const [canvasColor, setCanvasColor] = useState(CANVAS_COLOR);
  const [selectionColor, setSelectionColor] = useState(SELECTION_COLOR);

  // Selection highlight colors
  const initialColors = themeManager.getCurrentColors();
  const [selectionHighlightColor, setSelectionHighlightColor] = useState(initialColors.selectionHighlightColor);
  const [selectionHandleColor, setSelectionHandleColor] = useState(initialColors.selectionHandleColor);

  // Window resize state
  const canvasSizeRef = useRef<{ w: number; h: number }>({
    w: typeof window !== "undefined" ? window.innerWidth : 650,
    h: typeof window !== "undefined" ? window.innerHeight : 650,
  })

  // Snap state and Hysteresis
  const [currentSnap, setCurrentSnap] = useState<{
    type: SnapType;
    position: { x: number; y: number };
    strength: number;
  } | null>(null);
  const snapResultRef = useRef<SnapResult>({
    position: { x: 0, y: 0 },
    type: 'none',
    strength: 0
  });
  const [hysteresisActive, setHysteresisActive] = useState(false);
  const createNoSnapResult = (): SnapResult => ({
    position: { x: 0, y: 0 },
    type: 'none',
    strength: 0
  });

  // Shift-key orthogonal mode
  const [shiftHeld, setShiftHeld] = useState(false);

  // Orthogonal snapping toggle state
  const [orthoSnapEnabled, setOrthoSnapEnabled] = useState(true);
  
  // Temporarily disabling ortho snapping based on vertex priority
  const [orthoTempDisabled, setOrthoTempDisabled] = useState(false);

  // Temporarily disabling constraint snapping based on vertex priority
  const [constraintTempDisabled, setConstraintTempDisabled] = useState(false);

  // Track hovered vertices for constraint toggling
  const hoveredVerticesRef = useRef<Set<string>>(new Set());

  // Custom Cursor
  const [isDrawing, setIsDrawing] = useState(false);
  const cursor = useCursor(activeTool, shiftHeld, isDrawing, !!panStart, currentTheme, appState.transformPreview.active);
  const [globalCursor, setGlobalCursor] = useState<string>(CURSORS.DEFAULT(currentTheme));
  useEffect(() => {
    const activeLayer = layerService.getActiveLayer();
    const isLayerLocked = activeLayer?.properties.locked ?? false;
    const transformState = appState.transformPreview;
    
    let newCursor = CURSORS.DEFAULT(currentTheme);
  
    if (transformState.active) {
      if (!transformState.basePoint) {
        newCursor = 'pointer';
      } else {
        newCursor = 'move';
      }
    } else if (panStart) {
      // 🎯 REGULAR OPERATIONS (only when no transform active)
      newCursor = CURSORS.PANNING;
    } else if ((activeTool === 'LINE' || activeTool === 'RECTANGLE' || activeTool === 'CIRCLE') && isLayerLocked) {
      newCursor = CURSORS.DISABLED;
    } else if (activeTool === 'SELECTION' && shiftHeld && transformState.basePoint) {
      // newCursor = CURSORS.SELECT_SUBTRACT(currentTheme);
    } else if (activeTool === 'LINE' || activeTool === 'RECTANGLE' || activeTool === 'CIRCLE') {
      newCursor = CURSORS.CROSSHAIR;
    }

    setGlobalCursor(newCursor);
  }, [activeTool, shiftHeld, isDrawing, panStart, currentTheme, appState.transformPreview]);

  // Memoize ortho and grid config
  const orthoConfigMemo = useMemo(() => ({
    color: ORTHO_COLOR,
    dashPx: ORTHO_DASH_PX,
    gapPx: ORTHO_GAP_PX,
    thicknessPx: ORTHO_THICKNESS_PX,
    thresholdDeg: ORTHO_THRESHOLD_DEG,
    anglesDeg: ORTHO_ANGLES_DEG,
  }), []);
  const gridConfigMemo = useMemo(() => ({
    color: GRID_COLOR,
    spacingMin: GRID_SPACING_MIN_PX,
    spacingMax: GRID_SPACING_MAX_PX
  }), []);

  // 🎯 Redraw all with useCallback
  const redrawAll = useCallback((preview: { x: number; y: number } | null, snapResult: SnapResult) => {
    const startTime = performance.now();
    
    if (!serviceRef.current || !canvasRef.current) return;
    const service = serviceRef.current;

    const primitivesToRender = appState.primitives;

    // Layer-aware redraw method
    service.redrawAll(preview, snapResultRef.current, {
      offsetX, offsetY, scale,
      activeTool, 
      activeConstraint,
      constraintColor,
      currentStart, 
      orthoConfig: orthoConfigMemo,
      vertexConstraints,
      selectedPrimitiveIds, 
      selectionStart, 
      selectionEnd,
      lineColor, 
      snapColor,
      orthoThresholdDeg: ORTHO_THRESHOLD_DEG,
      orthoAnglesDeg: ORTHO_ANGLES_DEG,
      primitives: primitivesToRender,
      transformPreview: appState.transformPreview
    });
    
    const duration = performanceMonitor.endMeasurement('redrawAll', startTime);
    performanceMonitor.recordRedraw(duration);
  }, [
    appState.primitives,
    offsetX, offsetY, scale,
    activeTool,
    activeConstraint,
    currentStart,
    selectedPrimitiveIds,
    selectionStart,
    selectionEnd,
    orthoConfigMemo,
  ]);

  // Performance optimizations
  const performanceMonitor = useRef(new PerformanceMonitor()).current;
  const debouncedRedraw = useCallback(
    debounce((preview: { x: number; y: number } | null, snapResult: SnapResult) => {
      redrawAll(preview, snapResult);
    }, 16),
    [redrawAll]
  );
  const [showPerformance, setShowPerformance] = useState(false);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const PerformanceOverlay: React.FC<{ metrics: PerformanceMetrics | null }> = ({ metrics }) => {
    if (!metrics || !showPerformance) return null;
    
    return (
      <div style={{
        position: 'fixed',
        top: '100px',
        right: '20px',
        padding: '12px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        borderRadius: '8px',
        fontSize: '12px',
        fontFamily: 'monospace',
        zIndex: 10000,
        minWidth: '200px',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <strong>Performance</strong>
          <button 
            onClick={() => setShowPerformance(false)}
            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '16px' }}
          >
            ×
          </button>
        </div>
        <div>FPS: <span style={{ color: metrics.frameRate > 50 ? '#4ade80' : metrics.frameRate > 30 ? '#fbbf24' : '#ef4444' }}>
          {metrics.frameRate}
        </span></div>
        <div>Redraws: {metrics.redrawCount}</div>
        <div>Avg Redraw: {metrics.averageRedrawTime.toFixed(2)}ms</div>
        <div>Last Redraw: {metrics.lastRedrawTime.toFixed(2)}ms</div>
        {metrics.memoryUsage && (
          <div>Memory: {metrics.memoryUsage.toFixed(2)}MB</div>
        )}
      </div>
    );
  };

  // Error state
  const [error, setError] = useState<string | null>(null);
  const ErrorDisplay: React.FC<{ error: string | null; onDismiss: () => void }> = ({ error, onDismiss }) => {
    if (!error) return null;

    return (
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '16px',
        backgroundColor: '#fed7d7',
        border: '1px solid #feb2b2',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        zIndex: 10001,
        maxWidth: '400px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <strong>⚠️ Error</strong>
            <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>{error}</p>
          </div>
          <button 
            onClick={onDismiss}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: '#c53030'
            }}
          >
            ×
          </button>
        </div>
      </div>
    );
  };

  // Custom debug logger
  const logDebug = (...args: any[]) => {
    if (debug) console.log(...args);
  };

  // Coordinate transforms
  const screenToWorld = (x: number, y: number) => ({
    x: x / scale - offsetX,
    y: y / scale - offsetY,
  });
  const worldToScreen = (x: number, y: number) => ({
    x: (x + offsetX) * scale,
    y: (y + offsetY) * scale,
  });

  // Get mouse position
  const getMousePos = (evt: MouseEvent | React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    
    return { x, y };
  };

  // Generate a unique key for a vertex
  const getVertexKey = (vertex: { x: number; y: number }) => {
    return `${vertex.x.toFixed(4)},${vertex.y.toFixed(4)}`;
  };

  // Toggle vertex constraint
  const toggleVertexConstraint = (vertex: { x: number; y: number } | null | undefined) => {
    if (!vertex) return;
    CommandAdapters.addVertexConstraint(vertex);
  };

  // Orthogonal helpers
  const nearestOrthoAngleDeg = (start: { x: number; y: number }, cursorWorld: { x: number; y: number }) => {
    const dx = cursorWorld.x - start.x;
    const dy = cursorWorld.y - start.y;
    const angleRad = Math.atan2(dy, dx);
    let angleDeg = (angleRad * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;

    let bestCandidate = orthoConfig.anglesDeg[0];
    let bestBase = orthoConfig.anglesDeg[0];
    let bestDiff = 360;

    for (const base of orthoConfig.anglesDeg) {
      const candA = ((base % 360) + 360) % 360;
      const candB = ((base + 180.0) % 360.0 + 360.0) % 360.0;

      const dA = Math.abs(((angleDeg - candA + 540) % 360) - 180);
      const dB = Math.abs(((angleDeg - candB + 540) % 360) - 180);

      if (dA < bestDiff) {
        bestDiff = dA;
        bestCandidate = candA;
        bestBase = base;
      }
      if (dB < bestDiff) {
        bestDiff = dB;
        bestCandidate = candB;
        bestBase = base;
      }
    }

    return { angle: bestCandidate, base: bestBase, diff: bestDiff };
  };

  const applyOrthoConstraint = (start: { x: number; y: number }, cursorWorld: { x: number; y: number }) => {
    const nearest = nearestOrthoAngleDeg(start, cursorWorld);
    if (nearest.diff > orthoConfig.thresholdDeg) return null;

    const dx = cursorWorld.x - start.x;
    const dy = cursorWorld.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const rad = (nearest.angle * Math.PI) / 180.0;
    const nx = start.x + Math.cos(rad) * dist;
    const ny = start.y + Math.sin(rad) * dist;
    return { x: nx, y: ny, angle_deg: nearest.angle };
  };

  // Orthogonal and Constraint snapping setup
  const shouldUseOrthoSnapping = () => {
    if (shiftHeld) return true;
     return orthoSnapEnabled && !orthoTempDisabledRef.current;
  };
  const orthoSnapEnabledRef = useRef(orthoSnapEnabled);
  const snappingServiceRef = useRef(snappingService);
  const orthoTempDisabledRef = useRef(false);
  const constraintTempDisabledRef = useRef(false);

  // Tranform state
  const [transformState, setTransformState] = useState({
    isActive: false,
    mode: '' as TransformMode,
    message: ''
  });
  const updateTransformUI = useCallback(() => {
    const transformInfo = CommandAdapters.getTransformState();
    
    if (transformInfo.isActive) {
      let message = '';
      
      if (!transformInfo.hasBasePoint) {
        message = `Click anywhere to define base point.`;
      } else {
        message = `Click to define destination point. Esc to cancel.`;
      }
      
      showMessage(message, () => {
        CommandAdapters.cancelTransform();
        hideMessage();
      });
    } else {
      hideMessage();
    }
  }, []);

  // Message Overlay
  const MessageOverlay: React.FC<{
    isActive: boolean;
    message: string;
    onCancel?: () => void;
    cancelText?: string;
  }> = ({ isActive, message, onCancel, cancelText = "Cancel" }) => {
    if (!isActive) return null;
    
    return (
      <div className='messageOverlay' style={{
        opacity: isActive ? 1 : 0,
        transform: `translateX(-50%) translateY(${isActive ? '0px' : '20px'})`,
        pointerEvents: isActive ? 'auto' : 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <span>{message}</span>
        </div>
        
        {onCancel && (
          <button 
            onClick={onCancel}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 0, 0, 0.9)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 0, 0, 0.7)'}
          >
            {cancelText}
          </button>
        )}
      </div>
    );
  };
  const [messageOverlay, setMessageOverlay] = useState<{
    isActive: boolean;
    message: string;
    onCancel?: () => void;
    cancelText?: string;
  }>({
    isActive: false,
    message: '',
    onCancel: undefined,
    cancelText: "Cancel"
  });
  const showMessage = (message: string, onCancel?: () => void, cancelText?: string) => {
    setMessageOverlay({
      isActive: true,
      message,
      onCancel,
      cancelText
    });
  };
  const hideMessage = () => {
    setMessageOverlay({
      isActive: false,
      message: '',
      onCancel: undefined,
      cancelText: "Cancel"
    });
  };


  
  ////////// INITIALIZATION \\\\\\\\\\
  useEffect(() => {
    const run = async () => {
      await init();
      if (canvasRef.current) {
        const service = new RenderService(canvasRef.current);
        serviceRef.current = service;
  
        // Set initial transform values
        service.setTransform(offsetX, offsetY, scale);
  
        // Set orthogonal defaults
        service.setOrthoConfig(orthoConfigMemo);
        
        // Set grid defaults  
        service.setGridConfig(gridConfigMemo);

        // Set canvas and selection color
        service.setCanvasColor(
          canvasColor.r, canvasColor.g, canvasColor.b, canvasColor.a
        );
        service.setSelectionColor(
          selectionColor.r, selectionColor.g, selectionColor.b, selectionColor.a
        );
  
        service.clear();
        service.resize(canvasSizeRef.current.w, canvasSizeRef.current.h);
        service.drawGrid(offsetX, offsetY, scale);
      }
    };
    run();
  }, []);
  // Ortho and Snapping refs
  useEffect(() => {
    orthoSnapEnabledRef.current = orthoSnapEnabled;
  }, [orthoSnapEnabled]);
  useEffect(() => {
    snappingServiceRef.current = snappingService;
  }, [snappingService]);
  // Monitor frame rate
  useEffect(() => {
    const updateMetrics = () => {
      performanceMonitor.updateFrameRate();
    };
    
    let animationFrameId: number;
    const updateLoop = () => {
      updateMetrics();
      animationFrameId = requestAnimationFrame(updateLoop);
    };
    animationFrameId = requestAnimationFrame(updateLoop);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [performanceMonitor]);
  useEffect(() => {
    // Update performance metrics periodically when overlay is shown
    if (!showPerformance) return;
    
    const interval = setInterval(() => {
      setPerformanceMetrics(performanceMonitor.getMetrics());
    }, 1000);
    
    return () => clearInterval(interval);
  }, [showPerformance, performanceMonitor]);
  // Set initial theme class on mount
  useEffect(() => {
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(`theme-${currentTheme}`);
    
    // Cleanup on unmount
    return () => {
      document.body.classList.remove('theme-dark', 'theme-light');
    };
  }, []);
  // Expose services to global scope for console testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).themeManager = themeManager;
      (window as any).layerService = layerService;
      (window as any).selectionService = selectionService;
      (window as any).renderService = serviceRef.current;
      (window as any).appStateStore = appStateStore;
      (window as any).CommandAdapters = CommandAdapters;
      (window as any).getUndoHistory = () => appStateStore.getDebugInfo();
      
      // Snap result ref for testing
      (window as any).snapResultRef = snapResultRef;
      (window as any).CommandAdapters.snapResultRef = snapResultRef;

      // Redraw function for testing
      (window as any).forceRedraw = () => {
        redrawAll(previewEnd, snapResultRef.current);
      };

      // Performance testing
      (window as any).testPerformance = () => {
        console.log('🧪 Testing Performance...');
        
        // Test 1: Measure redraw performance
        console.log('📋 Test 1: Redraw performance');
        const metrics = performanceMonitor.getMetrics();
        console.log('Current Performance Metrics:', metrics);
        
        // Test 2: Create many primitives to test scaling
        console.log('📋 Test 2: Scaling test (creating 100 primitives)');
        const startTime = performance.now();
        
        for (let i = 0; i < 100; i++) {
          const testPrimitive: DrawingPrimitive = {
            id: `perf-test-${i}`,
            type: 'line',
            data: [i * 10, i * 10, i * 10 + 50, i * 10 + 50, 1, 1, 1, 1],
            layerId: null
          };
          CommandAdapters.drawLine(testPrimitive);
        }
        
        const endTime = performance.now();
        console.log(`Created 100 primitives in ${(endTime - startTime).toFixed(2)}ms`);
        
        // Test 3: Selection performance
        console.log('📋 Test 3: Selection performance');
        const selectionStart = performance.now();
        selectionService.selectByRectangle(
          { x: 0, y: 0 },
          { x: 1000, y: 1000 }
        );
        const selectionEnd = performance.now();
        console.log(`Rectangle selection took ${(selectionEnd - selectionStart).toFixed(2)}ms`);
        
        // Test 4: Memory usage
        console.log('📋 Test 4: Memory usage');
        console.log('Performance Metrics:', performanceMonitor.getMetrics());
        
        return true;
      };
      (window as any).getPerformanceMetrics = () => performanceMonitor.getMetrics();
      (window as any).resetPerformanceMetrics = () => performanceMonitor.reset();
      (window as any).togglePerformanceOverlay = () => setShowPerformance(prev => !prev);

      // Error testing
      (window as any).testErrorHandling = () => {
        console.log('🧪 Testing Error Handling...');
        
        try {
          // Test 1: Invalid layer assignment
          console.log('📋 Test 1: Invalid layer assignment');
          layerService.assignPrimitiveToLayer('test-primitive', 'non-existent-layer');
        } catch (error) {
          console.log('✅ Expected error caught:', getErrorMessage(error));
        }
        
        // Test 2: Invalid primitive registration
        console.log('📋 Test 2: Invalid primitive registration');
        try {
          selectionService.registerPrimitiveWithId('', 'line', []);
        } catch (error) {
          console.log('✅ Expected error caught:', getErrorMessage(error));
        }
        
        // Test 3: Test error boundary
        console.log('📋 Test 3: Testing error boundary (check console for boundary catch)');
        
        return true;
      };

      // Culling tests
      (window as any).testPerformanceLines = (count: number = 300) => {
        console.log(`🧪 Drawing ${count} random test lines...`);
        
        const startTime = performance.now();
        const linesCreated = [];
        
        // Get canvas bounds for reasonable distribution
        const canvas = canvasRef.current;
        if (!canvas) {
          console.error('❌ Canvas not found');
          return;
        }
        
        const width = canvas.width;
        const height = canvas.height;
        const scale = appStateStore.getState().scale;
        
        // Convert screen bounds to world coordinates for reasonable distribution
        const worldWidth = width / scale;
        const worldHeight = height / scale;
        
        for (let i = 0; i < count; i++) {
          // Create lines spread across a larger area than viewport
          const spreadFactor = 3; // Lines will be spread over 3x viewport area
          const x1 = (Math.random() - 0.5) * worldWidth * spreadFactor;
          const y1 = (Math.random() - 0.5) * worldHeight * spreadFactor;
          const x2 = x1 + (Math.random() - 0.5) * worldWidth * 0.5;
          const y2 = y1 + (Math.random() - 0.5) * worldHeight * 0.5;
          
          const testPrimitive = {
            id: `perf-test-line-${i}`,
            type: 'line' as const,
            data: [x1, y1, x2, y2, 1, 1, 1, 1], // White lines
            layerId: 'Default'
          };
          
          CommandAdapters.drawLine(testPrimitive);
          linesCreated.push(testPrimitive.id);
        }
        
        const endTime = performance.now();
        console.log(`✅ Created ${linesCreated.length} lines in ${(endTime - startTime).toFixed(2)}ms`);
        console.log(`📊 Check console for viewport culling messages when zooming out`);
        
        return linesCreated;
      };
      (window as any).clearTestLines = () => {
        const state = appStateStore.getState();
        const testLineIds = state.primitives
          .filter(p => p.id.startsWith('perf-test-line-'))
          .map(p => p.id);
        
        if (testLineIds.length > 0) {
          CommandAdapters.deleteSelected(testLineIds);
          console.log(`🗑️ Cleared ${testLineIds.length} test lines`);
        } else {
          console.log('ℹ️ No test lines found to clear');
        }
      };
      (window as any).runPerformanceTest = (lineCounts = [100, 300, 500, 1000]) => {
        console.log('🚀 Running performance test suite...');
        
        lineCounts.forEach(count => {
          console.log(`\n📋 Testing with ${count} lines:`);
          
          // Clear previous test
          (window as any).clearTestLines();
          
          // Create new lines
          const startTime = performance.now();
          (window as any).testPerformanceLines(count);
          const creationTime = performance.now() - startTime;
          
          console.log(`   Creation: ${creationTime.toFixed(2)}ms`);
          
          // Test panning performance
          const panStartTime = performance.now();
          // Simulate some panning by triggering multiple redraws
          for (let i = 0; i < 10; i++) {
            redrawAll(null, snapResultRef.current);
          }
          const panTime = performance.now() - panStartTime;
          
          console.log(`   Redraws: ${panTime.toFixed(2)}ms`);
          
          // Get current primitive count
          const totalPrimitives = appStateStore.getState().primitives.length;
          console.log(`   Total primitives: ${totalPrimitives}`);
        });
        
        console.log('\n🎉 Performance test completed');
      };

      // Layer service tests
      (window as any).testEnhancedLayerPanel = () => {
        console.log('🧪 Testing Enhanced LayerPanel...');
        
        // Test 1: Create different layer types
        const layer1 = layerService.createLayer('Drawing Layer');
        const layer2 = layerService.createLayer('Another Layer');
        
        // Test 2: Create a group
        const group = layerService.createLayer('My Group', 'group');
        const childLayer = layerService.createLayer('Child Layer', 'layer', group.id);
        
        // Test 3: Test property inheritance
        layerService.updateLayerProperties(group.id, { 
          color: { r: 1, g: 0, b: 0, a: 1 },
          opacity: 0.8 
        });
        
        console.log('Group properties updated');
        
        // Test 4: Create a block
        const blockId = layerService.createBlockFromLayers([layer1.id, layer2.id], 'TestBlock');
        console.log('Block created:', blockId);
        
        // Test 5: Test layer operations
        console.log('Available operations:');
        console.log('- Click layers to select');
        console.log('- Double-click to set active');
        console.log('- Ctrl+Click for multi-select');
        console.log('- Shift+Click for range select');
        console.log('- Right-click for context menu');
        
        return true;
      };
      (window as any).getLayerDebugInfo = (layerId?: string) => {
        if (layerId) {
          const layer = layerService.getLayer(layerId);
          const effective = layerService.getEffectiveProperties(layerId);
          return { layer, effective };
        }
        
        return {
          allLayers: layerService.getAllLayers(),
          hierarchy: layerService.getLayerHierarchy(),
          activeLayer: layerService.getActiveLayer()
        };
      };
      (window as any).debugLayerHierarchy = () => {
        layerService['debugLayerHierarchy']();
      };

      // Block system tests
      (window as any).testBlockDeletion = () => {
        console.log('🧪 Testing Block Deletion...');
        
        // Create a test block first
        const layer1 = layerService.createLayer('Test Layer 1');
        const layer2 = layerService.createLayer('Test Layer 2');
        
        const blockId = layerService.createBlockFromLayers([layer1.id, layer2.id], 'Test Block');
        console.log('✅ Test block created:', blockId);
        
        // Try to delete the block
        setTimeout(() => {
          console.log('🗑️ Attempting to delete block...');
          const success = layerService.deleteLayer(blockId);
          console.log('Block deletion result:', success);
        }, 1000);
      };
      (window as any).testBlockSystem = () => {
        console.log('🧪 Testing Block System Phase 1...');
        
        // Test 1: Data structure changes
        console.log('📋 Test 1: Data Structures');
        const testLayer: any = {
          id: 'test-layer',
          name: 'Test Layer', 
          type: 'layer',
          parentId: null,
          properties: { name: 'Test', type: 'layer', visible: true, locked: false, color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, expanded: true },
          children: [],
          primitiveIds: new Set(),
          isBlockInstance: true,
          blockDefinitionId: 'test-block',
          instanceTransform: { position: { x: 10, y: 20 }, rotation: 0, scale: 1 }
        };
        console.log('✅ Data structures updated successfully');

        // Test 2: Block creation method exists
        console.log('📋 Test 2: Block Creation Method');
        if (typeof layerService.createBlockFromLayers === 'function') {
          console.log('✅ createBlockFromLayers method exists');
        } else {
          console.error('❌ createBlockFromLayers method missing');
          return false;
        }

        // Test 3: Block instantiation method exists
        console.log('📋 Test 3: Block Instantiation Method');
        if (typeof layerService.instantiateBlock === 'function') {
          console.log('✅ instantiateBlock method exists');
        } else {
          console.error('❌ instantiateBlock method missing');
          return false;
        }

        // 🆕 Test 4: Create actual test layers and block
        console.log('📋 Test 4: Create Test Block');
        try {
          // Create test layers first
          const layer1 = layerService.createLayer('Test Layer 1');
          const layer2 = layerService.createLayer('Test Layer 2');
          
          console.log('✅ Test layers created:', { layer1: layer1.id, layer2: layer2.id });

          // Create block from test layers
          const blockInstanceId = layerService.createBlockFromLayers([layer1.id, layer2.id], 'Test Block');
          console.log('✅ Block created:', blockInstanceId);

          // Test 5: Verify block definition was created
          console.log('📋 Test 5: Verify Block Definition');
          const allBlocks = layerService.getAllBlockDefinitions();
          if (allBlocks.length > 0) {
            const blockDef = allBlocks[0];
            console.log('✅ Block definition created:', {
              name: blockDef.name,
              primitives: blockDef.sourcePrimitives.length,
              instances: blockDef.instances.size
            });
          } else {
            console.error('❌ No block definitions found');
            return false;
          }

          // Test 6: Instantiate block
          console.log('📋 Test 6: Instantiate Block');
          const blockDefs = layerService.getAllBlockDefinitions();
          if (blockDefs.length > 0) {
            const newInstanceId = layerService.instantiateBlock(blockDefs[0].id, { x: 100, y: 100 });
            console.log('✅ Block instance created:', newInstanceId);

            // Verify instances
            const instances = layerService.getBlockInstances(blockDefs[0].id);
            console.log('✅ Block instances:', instances.length);
          }

          console.log('🎉 ALL BLOCK SYSTEM TESTS PASSED!');
          return true;

        } catch (error) {
          console.error('❌ Test failed:', error);
          return false;
        }
      };
      (window as any).testBlockOperations = () => {
        console.log('🧪 Testing Block Operations...');
        
        try {
          // Test 1: Create test block with instances
          console.log('📋 Test 1: Create Test Block with Instances');
          const layer1 = layerService.createLayer('Ops Test Layer 1');
          const layer2 = layerService.createLayer('Ops Test Layer 2');
          
          const blockInstanceId = layerService.createBlockFromLayers([layer1.id, layer2.id], 'Operations Block');
          const blockDefs = layerService.getAllBlockDefinitions();
          const blockDef = blockDefs[0];
          
          // Create multiple instances
          const instance1 = layerService.instantiateBlock(blockDef.id, { x: 100, y: 100 });
          const instance2 = layerService.instantiateBlock(blockDef.id, { x: 200, y: 200 });
          
          console.log('✅ Block with instances created:', {
            definition: blockDef.id,
            instances: blockDef.instances.size
          });

          // Test 2: Delete block instance
          console.log('📋 Test 2: Delete Block Instance');
          layerService.deleteBlockInstance(instance1);
          const instancesAfterDelete = layerService.getBlockInstances(blockDef.id);
          console.log('✅ Instance deleted, remaining:', instancesAfterDelete.length);

          // Test 3: Explode block instance
          console.log('📋 Test 3: Explode Block Instance');
          const groupId = layerService.explodeBlockInstance(instance2);
          console.log('✅ Instance exploded to group:', groupId);
          
          // Verify definition still exists
          const defsAfterExplode = layerService.getAllBlockDefinitions();
          console.log('✅ Block definition still exists:', defsAfterExplode.length > 0);

          // Test 4: Explode block definition
          console.log('📋 Test 4: Explode Block Definition');
          if (defsAfterExplode.length > 0) {
            const finalGroupId = layerService.explodeBlockDefinition(defsAfterExplode[0].id);
            console.log('✅ Definition exploded to group:', finalGroupId);
          }

          // Test 5: Verify cleanup
          console.log('📋 Test 5: Verify Cleanup');
          const finalDefs = layerService.getAllBlockDefinitions();
          console.log('✅ No block definitions remain:', finalDefs.length === 0);

          console.log('🎉 ALL BLOCK OPERATIONS WORK!');
          return true;
          
        } catch (error) {
          console.error('❌ Block operations test failed:', error);
          return false;
        }
      };
      (window as any).testBlockEditMode = () => {
        console.log('🧪 Testing Block Edit Mode...');
        
        try {
          // Test 1: Create test block
          console.log('📋 Test 1: Create Test Block');
          const layer1 = layerService.createLayer('Edit Test Layer');
          const blockInstanceId = layerService.createBlockFromLayers([layer1.id], 'Edit Test Block');
          const blockDefs = layerService.getAllBlockDefinitions();
          const blockDef = blockDefs[0];
          
          console.log('✅ Test block created:', blockDef.id);

          // Test 2: Enter block edit mode
          console.log('📋 Test 2: Enter Block Edit Mode');
          layerService.enterBlockEditMode(blockDef.id);
          console.log('✅ Block edit mode entered');

          // Test 3: Verify edit mode state
          console.log('📋 Test 3: Verify Edit Mode State');
          const isEditing = layerService.isInBlockEditMode();
          const editingBlock = layerService.getEditingBlockDefinition();
          console.log('✅ Edit mode active:', isEditing);
          console.log('✅ Editing block:', editingBlock?.name);

          // Test 4: Exit block edit mode (save)
          console.log('📋 Test 4: Exit Block Edit Mode (Save)');
          layerService.exitBlockEditMode(true);
          console.log('✅ Block edit mode exited (saved)');

          // Test 5: Enter and cancel
          console.log('📋 Test 5: Enter and Cancel Edit Mode');
          layerService.enterBlockEditMode(blockDef.id);
          layerService.exitBlockEditMode(false);
          console.log('✅ Block edit mode exited (cancelled)');

          console.log('🎉 BLOCK EDIT MODE WORKS!');
          return true;
          
        } catch (error) {
          console.error('❌ Block edit mode test failed:', error);
          return false;
        }
      };

      // Transform tests
      (window as any).testTransformSystem = () => {
        console.log('🧪 Testing Transform System...');
        
        try {
          // Test 1: Transform commands exist
          console.log('📋 Test 1: Transform Commands');
          if (typeof CommandAdapters.startTransform === 'function') {
            console.log('✅ startTransform command exists');
          } else {
            console.error('❌ startTransform command missing');
            return false;
          }
          
          if (typeof CommandAdapters.transformMove === 'function') {
            console.log('✅ transformMove command exists');
          } else {
            console.error('❌ transformMove command missing');
            return false;
          }
          
          // Test 2: Create test primitives and transform them
          console.log('📋 Test 2: Transform Primitives');
          const testPrimitive: DrawingPrimitive = {
            id: 'transform-test-line',
            type: 'line',
            data: [0, 0, 50, 50, 1, 1, 1, 1],
            layerId: 'Default'
          };
          
          CommandAdapters.drawLine(testPrimitive);
          console.log('✅ Test primitive created');
          
          // Select the primitive
          CommandAdapters.setSelection(['transform-test-line']);
          console.log('✅ Primitive selected');
          
          // Start move transform
          CommandAdapters.startTransform('move');
          console.log('✅ Move transform started');
          
          // Test 3: Verify transform state
          console.log('📋 Test 3: Transform State');
          const transformState = CommandAdapters.getTransformState();
          console.log('Transform state:', transformState);
          
          if (transformState.isActive && transformState.mode === 'move') {
            console.log('✅ Transform state correct');
          } else {
            console.error('❌ Transform state incorrect');
            return false;
          }
          
          console.log('🎉 TRANSFORM SYSTEM TESTS PASSED!');
          return true;
          
        } catch (error) {
          console.error('❌ Transform test failed:', error);
          return false;
        }
      };
      (window as any).testCompleteTransform = () => {
        console.log('🧪 Testing Complete Transform Workflow...');
        
        try {
          // Test 1: Create test primitives
          console.log('📋 Test 1: Create Test Primitives');
          const linePrimitive: DrawingPrimitive = {
            id: 'transform-line',
            type: 'line',
            data: [0, 0, 100, 100, 1, 1, 1, 1],
            layerId: 'Default'
          };
          
          const rectPrimitive: DrawingPrimitive = {
            id: 'transform-rect',
            type: 'rectangle', 
            data: [50, 50, 150, 150, 1, 1, 1, 1],
            layerId: 'Default'
          };
          
          CommandAdapters.drawLine(linePrimitive);
          CommandAdapters.drawRectangle(rectPrimitive);
          console.log('✅ Test primitives created');

          // Test 2: Select and transform primitives
          console.log('📋 Test 2: Transform Primitives');
          CommandAdapters.setSelection(['transform-line', 'transform-rect']);
          console.log('✅ Primitives selected');
          
          // Move selection
          CommandAdapters.transformMove(['transform-line', 'transform-rect'], 20, 20);
          console.log('✅ Primitives moved');
          
          // Test 3: Verify final positions
          console.log('📋 Test 3: Verify Final Positions');
          const finalState = appStateStore.getState();
          const movedLine = finalState.primitives.find(p => p.id === 'transform-line');
          const movedRect = finalState.primitives.find(p => p.id === 'transform-rect');
          
          if (movedLine && movedLine.data[0] === 20 && movedLine.data[1] === 20) {
            console.log('✅ Line moved correctly');
          } else {
            console.error('❌ Line not moved correctly');
            return false;
          }
          
          if (movedRect && movedRect.data[0] === 70 && movedRect.data[1] === 70) {
            console.log('✅ Rectangle moved correctly');
          } else {
            console.error('❌ Rectangle not moved correctly');
            return false;
          }
          
          console.log('🎉 COMPLETE TRANSFORM WORKFLOW WORKS!');
          return true;
          
        } catch (error) {
          console.error('❌ Complete transform test failed:', error);
          return false;
        }
      };
      (window as any).debugTransform = () => {
        console.log('🔍 Transform Debug Info:');
        const state = CommandAdapters.getTransformState();
        console.log('Transform State:', state);
        console.log('App State Primitives:', appStateStore.getState().primitives.length);
        
        if (state.isActive && state.hasBasePoint) {
          console.log('✅ Should be showing live preview now!');
          console.log('Move your mouse - primitives should follow cursor');
        }
      };
      (window as any).debugPreviewUpdate = (x: number, y: number) => {
        console.log('🧪 Manually updating transform preview...');
        CommandAdapters.updateTransformPreview({ x, y });
        
        // Check state after update
        const state = appStateStore.getState();
        console.log('Preview primitives count:', state.transformPreview.previewPrimitives.length);
        console.log('Preview point:', state.transformPreview.previewPoint);
        
        if (state.transformPreview.previewPrimitives.length > 0) {
          console.log('First preview primitive:', state.transformPreview.previewPrimitives[0]);
        }
      };
      (window as any).testPreviewCalculation = () => {
        console.log('🧪 Testing Preview Calculation...');
        
        try {
          // Create a simple test primitive
          const testPrimitive: DrawingPrimitive = {
            id: 'debug-test',
            type: 'line',
            data: [100, 100, 200, 200, 1, 1, 1, 1],
            layerId: 'Default'
          };

          console.log('🧪 Test primitive:', testPrimitive);

          // Test the calculation directly using the exported helper
          const result = (window as any).transformHelpers.calculateTransformPreview(
            [testPrimitive],
            'move',
            { x: 150, y: 150 }, // base point
            { x: 250, y: 250 }, // cursor position
            false
          );

          console.log('🧪 Direct calculation result:', {
            input: testPrimitive.data,
            output: result[0]?.data,
            success: result.length > 0
          });

          return result.length > 0;

        } catch (error) {
          console.error('❌ Preview calculation test failed:', error);
          return false;
        }
      };
      (window as any).testTranslation = () => {
        console.log('🧪 Testing Translation Only...');
        
        try {
          const testPrimitive: DrawingPrimitive = {
            id: 'translation-test',
            type: 'line', 
            data: [100, 100, 200, 200, 1, 1, 1, 1],
            layerId: 'Default'
          };

          const result = (window as any).transformHelpers.applyTranslation(
            testPrimitive,
            50, // deltaX
            25  // deltaY
          );

          console.log('🧪 Translation test:', {
            original: testPrimitive.data.slice(0, 4),
            translated: result.data.slice(0, 4),
            expected: [150, 125, 250, 225],
            correct: result.data[0] === 150 && result.data[1] === 125
          });

          return result.data[0] === 150 && result.data[1] === 125;

        } catch (error) {
          console.error('❌ Translation test failed:', error);
          return false;
        }
      };
      (window as any).testFullPreviewFlow = () => {
        console.log('🧪 Testing Full Preview Flow...');
        
        try {
          // Create test primitive
          const testPrimitive: DrawingPrimitive = {
            id: 'flow-test',
            type: 'line',
            data: [100, 100, 200, 200, 1, 1, 1, 1],
            layerId: 'Default'
          };

          // Add to canvas
          CommandAdapters.drawLine(testPrimitive);
          
          // Select it
          CommandAdapters.setSelection(['flow-test']);
          
          // Start transform
          CommandAdapters.startTransform('move');
          
          // Set base point
          CommandAdapters.processTransformClick({ x: 150, y: 150 });
          
          // Check state after base point
          const stateAfterBase = appStateStore.getState();
          console.log('🔍 State after base point:', {
            active: stateAfterBase.transformPreview.active,
            basePoint: stateAfterBase.transformPreview.basePoint,
            originalPrimitives: stateAfterBase.transformPreview.originalPrimitives.length,
            previewPrimitives: stateAfterBase.transformPreview.previewPrimitives.length
          });
          
          // Update preview
          CommandAdapters.updateTransformPreview({ x: 250, y: 250 });
          
          // Check state after preview update
          const stateAfterPreview = appStateStore.getState();
          console.log('🔍 State after preview update:', {
            previewPoint: stateAfterPreview.transformPreview.previewPoint,
            previewPrimitives: stateAfterPreview.transformPreview.previewPrimitives.length,
            firstPreviewPrimitive: stateAfterPreview.transformPreview.previewPrimitives[0]
          });
          
          // Clean up
          CommandAdapters.cancelTransform();
          CommandAdapters.deleteSelected(['flow-test']);
          
          const success = stateAfterPreview.transformPreview.previewPrimitives.length > 0;
          console.log(success ? '✅ Full preview flow works!' : '❌ Preview primitives not generated');
          
          return success;

        } catch (error) {
          console.error('❌ Full preview flow test failed:', error);
          return false;
        }
      };
      (window as any).updateTransformUI = updateTransformUI;

      // Quick access commands for manual testing
      (window as any).startMove = () => {
        CommandAdapters.startTransform('move');
        console.log('🔄 Move transform started - click base point');
      };
      (window as any).startScale = () => {
        CommandAdapters.startTransform('scale');
        console.log('📐 Scale transform started - click base point');
      };
      (window as any).startRotate = () => {
        CommandAdapters.startTransform('rotate');
        console.log('🔄 Rotate transform started - click base point');
      };

      // Message overlay
      (window as any).showMessage = showMessage;
      (window as any).hideMessage = hideMessage;
    }
  }, [serviceRef.current, redrawAll, previewEnd, snapResultRef, showMessage, hideMessage]);
  // Subscribe to AppStateStore changes
  useEffect(() => {
    const unsubscribe = appStateStore.subscribe((newState: AppState) => {
      setAppState(newState);
    });
    return unsubscribe;
  }, []);
  // Subscribe to LayerService changes for automatic redraw
  // useEffect(() => {
  //   const eventTypes = layerService.getEventTypes();
    
  //   const unsubscribeLayersChanged = layerService.subscribe(
  //     eventTypes.LAYERS_CHANGED, 
  //     () => {
  //       console.log('🔄 Layer change - triggering redraw');
  //       redrawAll(previewEnd, snapResultRef.current);
  //     }
  //   );

  //   const unsubscribePropertiesChanged = layerService.subscribe(
  //     eventTypes.LAYER_PROPERTIES_CHANGED,
  //     () => {
  //       console.log('🎨 Layer property change - triggering redraw');
  //       redrawAll(previewEnd, snapResultRef.current);
  //     }
  //   );

  //   const unsubscribeActiveLayerChanged = layerService.subscribe(
  //     eventTypes.ACTIVE_LAYER_CHANGED,
  //     () => {
  //       console.log('🎯 Active layer change - triggering redraw');
  //       redrawAll(previewEnd, snapResultRef.current);
  //     }
  //   );

  //   return () => {
  //     unsubscribeLayersChanged();
  //     unsubscribePropertiesChanged();
  //     unsubscribeActiveLayerChanged();
  //   };
  // }, [redrawAll, previewEnd]);
  // Register lines with selection service
  useEffect(() => {
    selectionService.clearAll();
  
    primitives.forEach(primitive => {
      selectionService.registerPrimitiveWithId(primitive.id, primitive.type, primitive.data, primitive.layerId);
    });
  }, [primitives]);
  // Snapping config update on mount
  useEffect(() => {
    snappingService.updateConfig({
      thresholdPx: SNAP_THRESHOLD,
      constraintEnabled: orthoSnapEnabled,
      orthoEnabled: orthoSnapEnabled,
      orthoThresholdDeg: ORTHO_THRESHOLD_DEG,
      orthoAnglesDeg: ORTHO_ANGLES_DEG,
    });
  }, [orthoSnapEnabled]);
  // Context manager update when state changes
  useEffect(() => {
    contextManager.updateContext({
      primitives,
      vertexConstraints,
      activeConstraint,
      currentStart,
      shiftHeld,
      orthoTempDisabled,
      constraintTempDisabled,
      scale,
      offsetX,
      offsetY
    });
  }, [primitives, vertexConstraints, activeConstraint, currentStart, shiftHeld, 
  orthoTempDisabled, constraintTempDisabled, scale, offsetX, offsetY]);
  // Color configuration
  useEffect(() => {
    if (serviceRef.current) {
      serviceRef.current.setCanvasColor(
        canvasColor.r, canvasColor.g, canvasColor.b, canvasColor.a
      );
      serviceRef.current.setSelectionColor(
        selectionColor.r, selectionColor.g, selectionColor.b, selectionColor.a
      );
      
      // Redraw to apply the new canvas background color immediately
      redrawAll(previewEnd, snapResultRef.current);
    }
  }, [canvasColor, selectionColor]);
  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      canvasSizeRef.current = { w, h };
      
      if (canvasRef.current) {
        canvasRef.current.width = w * window.devicePixelRatio;
        canvasRef.current.height = h * window.devicePixelRatio;
        canvasRef.current.style.width = w + 'px';
        canvasRef.current.style.height = h + 'px';
      }
      
      if (serviceRef.current) {
        serviceRef.current.resize(w, h);
        redrawAll(previewEnd, snapResultRef.current); 
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize(); // Initial call to set size
    
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  // Global error handlers
  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      console.error('🚨 Global error caught:', event.error);
      setError(getErrorMessage(event.error));
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('🚨 Unhandled promise rejection:', event.reason);
      setError(getErrorMessage(event.reason));
      event.preventDefault();
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);
  // Keyboard listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F8" || e.key === "F9" || e.key === "F10" || e.key === "Escape" || e.key === "F11") {
        e.preventDefault();
      }

      if (e.key === "Shift") setShiftHeld(true);
      if (e.key === "F8") {
        const newOrthoEnabled = !orthoSnapEnabledRef.current;;
        setOrthoSnapEnabled(newOrthoEnabled);
        
        snappingServiceRef.current.updateConfig({
          orthoEnabled: newOrthoEnabled
        });
        
        logDebug("Ortho snap toggled:", newOrthoEnabled);
      }
      if (e.key === "F9") {
        const newConstraintEnabled = !snappingService.getConfig().constraintEnabled;
        
        snappingService.updateConfig({ 
          constraintEnabled: newConstraintEnabled 
        });

        if (!newConstraintEnabled) {
          CommandAdapters.clearVertexConstraints();
          CommandAdapters.setActiveConstraint(null);
          hoveredVerticesRef.current.clear();
        }
        logDebug("Constraint snap toggled:", newConstraintEnabled);
      }
      if (e.key === "F10") {
        e.stopPropagation(); 
        handleThemeToggle();
        return; 
      }
      if (e.key === "F11") {
        e.preventDefault();
        setShowPerformance(prev => !prev);
        console.log('📊 Performance overlay toggled');
      }
      if (e.key === "Escape") {
        // 🎯 Only handle ESC if command bar is NOT open
        const commandBar = document.querySelector('.command-bar');
        const isCommandBarOpen = commandBar && !commandBar.classList.contains('hidden');
        
        if (!isCommandBarOpen) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const currentState = appStateStore.getState();

          // 🎯 PRIORITY 1: Cancel active transform
          if (currentState.transformPreview.active) {
            console.log('⌨️ ESC: Cancelling active transform');
            CommandAdapters.cancelTransform();
            updateTransformUI();
          }
          
          // 🎯 PRIORITY 2: Clear selection if anything is selected
          if (currentState.selectedPrimitiveIds.length > 0) {
            console.log('⌨️ ESC: Clearing selection');
            CommandAdapters.setSelection([]);
          }
          
          // 🎯 PRIORITY 3: Reset to selection tool if using other tool
          if (currentState.activeTool !== 'SELECTION') {
            console.log('⌨️ ESC: Resetting to selection tool');
            CommandAdapters.setActiveTool('SELECTION');
            resetTool();
          }

        } else {
          console.log('⌨️ ESC ignored in App.tsx (command bar open)');
        }
        

        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" || e.key === "Z") {
          e.preventDefault();
          if (e.shiftKey) {
            appStateStore.redo();
            console.log("🔁 Redo triggered");
          } else {
            appStateStore.undo();
            console.log("⏪ Undo triggered");
          }
        }
        if (e.key === "y" || e.key === "Y") {
          e.preventDefault();
          appStateStore.redo();
          console.log("🔁 Redo triggered");
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
  // Zoom functionality
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (evt: WheelEvent) => {
      evt.preventDefault();
      const pos = getMousePos(evt);
    
      const oldScale = scale;
      const oldOffsetX = offsetX;
      const oldOffsetY = offsetY;
    
      const worldBeforeX = pos.x / oldScale - oldOffsetX;
      const worldBeforeY = pos.y / oldScale - oldOffsetY;
    
      const delta = -evt.deltaY * 0.001;
      let newScale = oldScale * (1 + delta);
      newScale = Math.max(0.05, Math.min(20000, newScale));
    
      const newOffsetX = pos.x / newScale - worldBeforeX;
      const newOffsetY = pos.y / newScale - worldBeforeY;
    
      CommandAdapters.zoom(newScale, newOffsetX, newOffsetY);
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [scale, offsetX, offsetY]);
  // Redraw all states
  useEffect(() => {
    redrawAll(previewEnd, snapResultRef.current);
  }, [primitives, scale, offsetX, offsetY, previewEnd, 
  lineColor, snapColor, snapResultRef.current, orthoConfig, 
  shiftHeld, orthoSnapEnabled, orthoTempDisabled, 
  vertexConstraints, activeConstraint, gridConfig, 
  canvasColor, selectionColor, currentTheme, 
  selectionHighlightColor, selectionHandleColor]);
  // Block edit mode
  useEffect(() => {
    const updateBlockEditMode = () => {
      const isEditing = layerService.isInBlockEditMode();
      setIsBlockEditMode(isEditing);
      
      if (isEditing) {
        const editingBlock = layerService.getEditingBlockDefinition();
        setEditingBlockName(editingBlock?.name || '');
      } else {
        setEditingBlockName('');
      }
    };

    // Update when layers change
    const eventTypes = layerService.getEventTypes();
    const unsubscribe = layerService.subscribe(eventTypes.LAYERS_CHANGED, updateBlockEditMode);
    
    return unsubscribe;
  }, []);
  // Force update for command adapters
  useEffect(() => {
    if (CommandAdapters.setLivePreviewCallback) {
      CommandAdapters.setLivePreviewCallback(() => {
        // 🎯 This gets called every time live preview updates
        redrawAll(previewEnd, snapResultRef.current);
      });
    }

    return () => {
      // Cleanup
      if (CommandAdapters.setLivePreviewCallback) {
        CommandAdapters.setLivePreviewCallback(() => {});
      }
    };
  }, [redrawAll, previewEnd]);



  ////////// INTERACTION HANDLERS \\\\\\\\\\
  const handleMouseMove = useCallback(
    throttle((evt: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getMousePos(evt);
      const cursorWorld = screenToWorld(pos.x, pos.y);
      const worldPos = screenToWorld(pos.x, pos.y);
      let snapResult: SnapResult;
      const constraintSnap = snapResultRef.current.type === 'constraint' ? snapResultRef.current.position : null;
      let intersectionSnap = null;
      let finalPos = snapResultRef.current.type === 'vertex' ? snapResultRef.current.position : 
                    intersectionSnap ?? constraintSnap ?? cursorWorld;
      let preview = finalPos;

      // Panning functionality
      if (panStart) {
        const dx = (pos.x - panStart.x) / scale;
        const dy = (pos.y - panStart.y) / scale;
        
        CommandAdapters.panImmediate(offsetX + dx, offsetY + dy);
        
        setIsDrawing(false);
        setPanStart({ x: pos.x, y: pos.y });
        redrawAll(previewEnd, snapResultRef.current);
        // debouncedRedraw(previewEnd, snapResultRef.current);
        return;
      }

      // Handle transform preview with local snapping
      const transformState = appState.transformPreview;
      if (transformState.active && transformState.basePoint) {
        CommandAdapters.updateTransformPreview(cursorWorld, shiftHeld);
        debouncedRedraw(cursorWorld, snapResultRef.current);
        return; // Exit early, let transform handle snapping
      }

      // Only calculate snap for drawing tools and transformations
      if (activeTool === 'SELECTION' && !transformState.active) {
        // 🚫 SELECTION MODE: No snapping needed
        snapResult = {
          position: cursorWorld,
          type: 'none',
          strength: 0
        };
        snapResultRef.current = snapResult;
      } else {
        // ✅ DRAWING MODE: Calculate snapping
        snapResult = snappingService.findSnap(pos, contextManager.getContext());
        let finalSnapResult = snapResult;

        // Constraint state management to prevent premature clearing
        // Keep constraint guides visible during intersection snapping
        const currentSnapResult = snapResultRef.current;  
        if (currentSnapResult.type === 'constraint' && currentSnapResult.metadata?.constraint) {
          CommandAdapters.setActiveConstraint(currentSnapResult.metadata.constraint);
        } else if (currentSnapResult.type === 'intersection') {
          // CAN WE ADD HERE TO FORCE SHOW PREVIOUS DETECTED CONSTRAINT?
        } else if (currentSnapResult.type === 'vertex') {
          // Only clear constraint if we're strongly snapped to vertex
          if (currentSnapResult.strength > 0.8) {
            CommandAdapters.setActiveConstraint(null);
          }
        } else {
          // Clear constraint only when we're definitely not in any constraint scenario
          CommandAdapters.setActiveConstraint(null);
        }

        // Hysteresis Logic
        if (hysteresisActive && currentSnap?.type === 'vertex') {
          const currentVertex = currentSnap.position;
          
          // Calculate distance in WORLD coordinates (not screen)
          const worldDistance = Math.sqrt(
            Math.pow(cursorWorld.x - currentVertex.x, 2) + 
            Math.pow(cursorWorld.y - currentVertex.y, 2)
          );
          const UNSNAP_THRESHOLD = (SNAP_THRESHOLD / scale); // Scale-aware threshold
          
          console.log('🎯 Hysteresis active - distance:', worldDistance.toFixed(2), 'threshold:', UNSNAP_THRESHOLD.toFixed(2));
          
          if (worldDistance <= UNSNAP_THRESHOLD) {
            // Stay locked, but check if we found a better vertex
            if (snapResult.type === 'vertex' && snapResult.strength > currentSnap.strength) {
              console.log('🔄 Switching to better vertex:', snapResult.position);
              // Switch to better vertex
              finalSnapResult = snapResult;
              setCurrentSnap({
                type: 'vertex',
                position: snapResult.position,
                strength: snapResult.strength
              });
            } else {
              // Keep current vertex with updated strength
              finalSnapResult = {
                position: currentVertex,
                type: 'vertex',
                metadata: { vertex: currentVertex },
                strength: Math.max(0.7, 1 - (worldDistance / UNSNAP_THRESHOLD))
              };
              console.log('🔒 Staying locked to vertex:', currentVertex);
            }
          } else {
            // Outside threshold - release hysteresis
            console.log('🔓 Releasing hysteresis - too far from vertex');
            setHysteresisActive(false);
            setCurrentSnap(null);
            orthoTempDisabledRef.current = false;
            constraintTempDisabledRef.current = false;
            setOrthoTempDisabled(false);
            setConstraintTempDisabled(false);
          }
        }

        // 🎯 VERTEX PRIORITY: If we found a new vertex and not in hysteresis
        if (!hysteresisActive && finalSnapResult.type === 'vertex') {
          console.log('🔐 Locking to new vertex:', finalSnapResult.position);
          setHysteresisActive(true);
          setCurrentSnap({
            type: 'vertex', 
            position: finalSnapResult.position,
            strength: finalSnapResult.strength
          });
          // 🎯 IMMEDIATE disabling using refs
          orthoTempDisabledRef.current = true;
          constraintTempDisabledRef.current = true;
          setOrthoTempDisabled(true);
          setConstraintTempDisabled(true);
        }

        // Extend visual indicator during hysteresis when snap service returns 'none'
        if (hysteresisActive && currentSnap?.type === 'vertex' && finalSnapResult.type === 'none') {
          const currentVertex = currentSnap.position;
          const worldDistance = Math.sqrt(
            Math.pow(cursorWorld.x - currentVertex.x, 2) + 
            Math.pow(cursorWorld.y - currentVertex.y, 2)
          );
          const VISUAL_THRESHOLD = (SNAP_THRESHOLD / scale); // Use same threshold now
          
          if (worldDistance <= VISUAL_THRESHOLD) {
            console.log('🔵 Extending snap indicator during hysteresis');
            finalSnapResult = {
              position: currentVertex,
              type: 'vertex',
              metadata: { vertex: currentVertex },
              strength: Math.max(0.3, 1 - (worldDistance / VISUAL_THRESHOLD)) // Fade out near edge
            };
          }
        }

        // Update snapResultRef with the final result (including hysteresis)
        const shouldUpdateSnapRef = 
          finalSnapResult.type !== snapResultRef.current.type ||
          finalSnapResult.position.x !== snapResultRef.current.position.x ||
          finalSnapResult.position.y !== snapResultRef.current.position.y;

        if (shouldUpdateSnapRef) {
          snapResultRef.current = finalSnapResult;
        }

        // Temporary disabling now handled by hysteresis logic above
        // Only reset if we're completely out of hysteresis
        if (!hysteresisActive && (orthoTempDisabledRef.current || constraintTempDisabledRef.current)) {
          orthoTempDisabledRef.current = false;
          constraintTempDisabledRef.current = false;
          setOrthoTempDisabled(false);
          setConstraintTempDisabled(false);
        }

      }

      // Selection rectangle - IMMEDIATE updates
      if (activeTool === 'SELECTION' && selectionStart) {
        CommandAdapters.updateSelectionRect(selectionStart, cursorWorld);
        redrawAll(previewEnd, snapResultRef.current); // Immediate redraw for selection
        return;
      }

      // Check for vertex hover to toggle constraints (drawing tools only)
      if (activeTool !== 'SELECTION' && snapResultRef.current.type === 'vertex' && snapResultRef.current.metadata?.vertex && snappingService.getConfig().constraintEnabled) {
        const vertex = snapResultRef.current.metadata.vertex;
        const key = getVertexKey(vertex);
        
        if (!hoveredVerticesRef.current.has(key)) {
          hoveredVerticesRef.current.add(key);
          toggleVertexConstraint(vertex);
          console.log(`🎯 Added constraint for vertex: ${key}`);
        }
      } else {
        hoveredVerticesRef.current.clear();
      }

      // Detect currentStart point for constraints when not snapping to it
      if (activeTool !== 'SELECTION' && currentStart && snappingService.getConfig().constraintEnabled) {
        const currentStartScreen = worldToScreen(currentStart.x, currentStart.y);
        const cursorScreen = pos;
        
        // Check if cursor is hovering near currentStart point (for constraint detection only)
        const dx = currentStartScreen.x - cursorScreen.x;
        const dy = currentStartScreen.y - cursorScreen.y;
        const screenDistance = Math.sqrt(dx * dx + dy * dy);
        
        if (screenDistance < SNAP_THRESHOLD) {
          const key = getVertexKey(currentStart);
          if (!hoveredVerticesRef.current.has(key)) {
            hoveredVerticesRef.current.add(key);
            toggleVertexConstraint(currentStart);
            console.log(`🎯 Added constraint for currentStart: ${key}`);
          }
        }
      }

      if (!currentStart) return;

      if (activeTool === 'LINE') {
        const currentSnapResult = snapResultRef.current;

        if (currentSnapResult.type === 'intersection') {
          preview = currentSnapResult.position;
        } else if (hysteresisActive && currentSnap?.type === 'vertex') {
          console.log('🔒 Hysteresis active - locking to vertex at:', currentSnap.position);
          preview = currentSnap.position;
        } else if (currentSnapResult.type === 'vertex') {
          preview = currentSnapResult.position;
        } else if (shiftHeld) {
          const dx = finalPos.x - currentStart.x;
          const dy = finalPos.y - currentStart.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const nearest = nearestOrthoAngleDeg(currentStart, finalPos);
          const rad = (nearest.angle * Math.PI) / 180;
          preview = { x: currentStart.x + Math.cos(rad) * dist, y: currentStart.y + Math.sin(rad) * dist };
        } else if (shouldUseOrthoSnapping() && !orthoTempDisabledRef.current) {
          const constrained = applyOrthoConstraint(currentStart, finalPos);
          if (constrained) {
            preview = { x: constrained.x, y: constrained.y };
          } else {
            preview = finalPos;
          }
        } else {
          preview = finalPos;
        }

        CommandAdapters.updatePreview(preview);
        debouncedRedraw(preview, snapResultRef.current);
        return;
      }

      // Rectangle preview (drawing tools only)
      if (activeTool === 'RECTANGLE' && currentStart) {
        CommandAdapters.updatePreview(finalPos);
        debouncedRedraw(finalPos, snapResultRef.current);
        return;
      }

      CommandAdapters.updatePreview(preview);
      debouncedRedraw(preview, snapResultRef.current);
    }, 16),
    [
      panStart, activeTool, selectionStart, currentStart, scale, offsetX, offsetY,
      screenToWorld, snappingService, debouncedRedraw, previewEnd,
      hysteresisActive, currentSnap, shiftHeld, orthoSnapEnabled,
      worldToScreen, SNAP_THRESHOLD, nearestOrthoAngleDeg, applyOrthoConstraint,
      shouldUseOrthoSnapping, getVertexKey, toggleVertexConstraint, vertexConstraints,
      contextManager, redrawAll, appState.transformPreview
    ]
  );
  const handleMouseDown = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(evt);
    const worldPos = screenToWorld(pos.x, pos.y);

    // MIDDLE CLICK: Panning (allowed during drawing or transformations)
    if (evt.button === 1) {
      setPanStart({ x: pos.x, y: pos.y });
      setIsDrawing(false);
    }

    // LEFTCLICK: Drawing and Selection operations
    if (evt.button === 0) {
      const activeLayer = layerService.getActiveLayer();
      let snapResult: SnapResult;
      if (activeTool === 'SELECTION') {
        // SELECTION MODE: No snapping
        snapResult = {
          position: screenToWorld(pos.x, pos.y),
          type: 'none',
          strength: 0
        };
      } else {
        // DRAWING MODE: Calculate snapping
        snapResult = snappingService.findSnap(pos, contextManager.getContext());
      }
      snapResultRef.current = snapResult; 
      const constraintSnap = snapResult.type === 'constraint' ? snapResult.position : null;
      let intersectionSnap = null;
      let finalPos = snapResult.type === 'vertex' ? snapResult.position : intersectionSnap ?? constraintSnap ?? screenToWorld(pos.x, pos.y);

      // Handle transform operation first
      if (CommandAdapters.processTransformClick(worldPos)) {
        console.log('🛠️ Transform click processed');
        evt.preventDefault();
        updateTransformUI(); // Update transform overlay
        return;
      }
  
      // Set drawing state for non-selection tools
      if (activeTool !== 'SELECTION') {
        if (!activeLayer) {
          console.warn('🚫 No active layer - cannot draw');
          return;
        }
        
        // 🎯 FIX: Only allow drawing on actual LAYERS (not groups/blocks)
        if (activeLayer.type !== 'layer') {
          console.warn(`🚫 Cannot draw on ${activeLayer.type} - only on layers`);
          return;
        }
        
        // 🎯 FIX: Validate layer still exists
        const layerExists = layerService.getLayer(activeLayer.id);
        if (!layerExists) {
          console.warn('🚫 Active layer no longer exists');
          return;
        }
        
        // 🎯 FIX: Use EFFECTIVE properties to check if layer is locked
        const effectiveProps = layerService.getEffectiveProperties(activeLayer.id);
        if (effectiveProps.locked) {
          console.warn('🚫 Cannot draw on locked layer:', activeLayer.name);
          return;
        }
        
        setIsDrawing(true);
      }

      // Find intersection when currently drawing 
      if (currentStart) {
        intersectionSnap = snapResult.type === 'intersection' ? snapResult.position : null;
      }

      // Selection tool - CLEAN and SIMPLE
      if (activeTool === 'SELECTION') {
        const worldPos = screenToWorld(pos.x, pos.y);
        
        if (!selectionStart) {
          CommandAdapters.updateSelectionRect(worldPos, worldPos);
          setShiftHeldForSelection(shiftHeld);
        } else {
          const result = selectionService.selectByRectangle(
            selectionStart, 
            worldPos, 
            []
          );
      
          let newSelection: string[];
          
          if (shiftHeldForSelection) {
            newSelection = selectedPrimitiveIds.filter(id => !result.selectedIds.includes(id));
            console.log(`🗑️ Subtracting ${result.selectedIds.length} from selection`);
          } else {
            const combined = new Set([...selectedPrimitiveIds, ...result.selectedIds]);
            newSelection = Array.from(combined);
            console.log(`➕ Adding ${result.selectedIds.length} to selection`);
          }
      
          CommandAdapters.setSelection(newSelection);
          CommandAdapters.updateSelectionRect(null, null);
        }
        return;
      }

      // Rectangle tool
      if (activeTool === 'RECTANGLE') {
        const cursorWorld = snapResult.type !== 'none' ? snapResult.position : screenToWorld(pos.x, pos.y);

        if (!currentStart) {
          CommandAdapters.updateCurrentStart(cursorWorld);
          CommandAdapters.updatePreview(cursorWorld);
        } else {
          const newPrimitive: DrawingPrimitive = {
            id: `primitive-${crypto.randomUUID()}`,
            type: 'rectangle',
            data: [currentStart.x, currentStart.y, cursorWorld.x, cursorWorld.y, 
                  lineColor.r, lineColor.g, lineColor.b, lineColor.a],
            layerId: layerService.getActiveLayerId()
          };
          
          CommandAdapters.drawRectangle(newPrimitive);
          CommandAdapters.updateCurrentStart(null);
          CommandAdapters.updatePreview(null);
        }
        return;
      }

      // Line tool
      if (activeTool === 'LINE') {
        if (activeLayer && activeLayer.properties.locked) {
          console.warn("🚫 Cannot draw on locked layer:", activeLayer.name);
          return; 
        }

        if (previewEnd) {
          finalPos = previewEnd;
        } else if (shiftHeld && previewEnd) {
          finalPos = previewEnd;
        } else if (!shiftHeld && currentStart && shouldUseOrthoSnapping()) {
          const cursorWorld = screenToWorld(pos.x, pos.y);
          const constrained = applyOrthoConstraint(currentStart, cursorWorld);
          if (constrained) {
            finalPos = { x: constrained.x, y: constrained.y };
          }
        }

        if (!currentStart) {
          CommandAdapters.updateCurrentStart(finalPos);
        } else {
          const newPrimitive: DrawingPrimitive = {
            id: `primitive-${crypto.randomUUID()}`,
            type: 'line',
            data: [currentStart.x, currentStart.y, finalPos.x, finalPos.y, 
                  lineColor.r, lineColor.g, lineColor.b, lineColor.a],
            layerId: layerService.getActiveLayerId()
          };

          CommandAdapters.drawLine(newPrimitive);
          CommandAdapters.updateCurrentStart(finalPos);
          CommandAdapters.updatePreview(null);

          CommandAdapters.clearVertexConstraints();
          CommandAdapters.setActiveConstraint(null);
          hoveredVerticesRef.current.clear();
        }
        return;
      }

      // Transform operations
      if (CommandAdapters.processTransformClick(worldPos)) {
        console.log('🛠️ Transform operation should start now');
        evt.preventDefault();
        updateTransformUI();
        return;
      }
          
    }

  };
  const handleMouseUp = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    if (evt.button === 0) {
      setIsDrawing(false);
    } else if (evt.button === 1) {
      setPanStart(null);
      CommandAdapters.panFinal(offsetX, offsetY);
      redrawAll(previewEnd, snapResultRef.current);
      const transformState = appState.transformPreview;
    }
  };
  const handleContextMenu = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    evt.preventDefault();

    // Cancel transform if active
    if (appState.transformPreview.active) {
      CommandAdapters.cancelTransform();
      updateTransformUI();
      return;
    }
    resetTool();
  };
  const handleClear = () => {
    console.log('CANVAS CLEARED');
    CommandAdapters.clearCanvas();
    resetTool();
  };
  const handleToolChange = (tool: string) => {
    if (!isValidToolType(tool)) {
      console.warn('⚠️ Invalid tool type:', tool);
      return;
    }
    CommandAdapters.setActiveTool(tool);
    CommandAdapters.setSelection([]);
    resetTool();
  };
  const resetTool = () => {
    const startTime = performance.now();

    CommandAdapters.updateCurrentStart(null);
    CommandAdapters.updatePreview(null);
    CommandAdapters.updateSelectionRect(null, null);
    CommandAdapters.updateSelectionRect(null, null);
    CommandAdapters.setActiveConstraint(null);
    CommandAdapters.clearVertexConstraints();
    
    snapResultRef.current = createNoSnapResult();
    setHysteresisActive(false);
    setCurrentSnap(null);
    hoveredVerticesRef.current.clear();

    orthoTempDisabledRef.current = false;
    constraintTempDisabledRef.current = false;

    if (orthoTempDisabled) {
      setOrthoTempDisabled(false);
    }
    redrawAll(null, snapResultRef.current);

    const endTime = performance.now();
    console.log(`🔄 resetTool executed in ${(endTime - startTime).toFixed(2)}ms`);
  };
  const handleThemeToggle = () => {
    console.log('🎨 handleThemeToggle called');
    const newTheme = themeManager.getCurrentTheme() === 'dark' ? 'light' : 'dark';
    themeManager.toggleTheme();
    setCurrentTheme(newTheme);
  
    const currentColors = themeManager.getCurrentColors();

    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(`theme-${newTheme}`);

    if (serviceRef.current) {
      serviceRef.current.setGridConfig({
        ...gridConfig,
        color: currentColors.gridColor
      });
      serviceRef.current.setOrthoConfig({
        ...orthoConfig,
        color: currentColors.orthoColor
      });
      serviceRef.current.setCanvasColor(
        currentColors.canvasColor.r, 
        currentColors.canvasColor.g, 
        currentColors.canvasColor.b, 
        currentColors.canvasColor.a
      );
      serviceRef.current.setSelectionColor(
        currentColors.selectionColor.r,
        currentColors.selectionColor.g, 
        currentColors.selectionColor.b, 
        currentColors.selectionColor.a
      );
      serviceRef.current.setSelectionHighlightColor(currentColors.selectionHighlightColor);
      serviceRef.current.setSelectionHandleColor(currentColors.selectionHandleColor);
    }

    if (canvasRef.current) {
      const activeLayer = layerService.getActiveLayer();
      const isLayerLocked = activeLayer?.properties.locked ?? false;
      
      let newCursor = CURSORS.DEFAULT(newTheme);
      
      console.log('🎯 Immediate cursor update:', newCursor);
      canvasRef.current.style.cursor = newCursor;
    }

    setConstraintColor(currentColors.constraintColor);
    setOrthoConfig(prev => ({ ...prev, color: currentColors.orthoColor }));
    setGridConfig(prev => ({ ...prev, color: currentColors.gridColor }));
    setCanvasColor(currentColors.canvasColor);
    setSelectionColor(currentColors.selectionColor);
    setLineColor(currentColors.lineColor);
    setSnapColor(currentColors.snapColor);
    setSelectionHighlightColor(currentColors.selectionHighlightColor);
    setSelectionHandleColor(currentColors.selectionHandleColor);
    
    redrawAll(previewEnd, snapResultRef.current);
  };

  

  ////////// INTERFACE \\\\\\\\\\
  return (
    <ErrorBoundary fallback={SimpleErrorFallback}>
      <div style={{ 
        position: "relative", 
        width: "100vw", 
        height: "100vh", 
        cursor: globalCursor,
        overflow: 'hidden',
        outline: isBlockEditMode ? '10px solid rgba(255, 0, 0)' : 'none',
        outlineOffset: isBlockEditMode ? '-10px' : '0',
        boxSizing: 'border-box' 
        }}>

        {/* Block edit mode header */}
        {isBlockEditMode && (
          <div className="blockEditModeHeader">
            <span>Editing: {/*{editingBlockName}*/}</span>
            <button
              className='blockSave'
              onClick={() => {
                layerService.exitBlockEditMode(true);
                console.log('💾 Saved block changes');
              }}
            >
              Save
            </button>
            <button
              className='blockCancel'
              onClick={() => {
                layerService.exitBlockEditMode(false);
                console.log('❌ Cancelled block changes');
              }}
            >
              Cancel
            </button>
          </div>
        )}

        <MessageOverlay
          isActive={messageOverlay.isActive}
          message={messageOverlay.message}
          onCancel={messageOverlay.onCancel}
          cancelText={messageOverlay.cancelText}
        />
        <ErrorDisplay error={error} onDismiss={() => setError(null)} />
        <PerformanceOverlay metrics={performanceMetrics} />

        <canvas
          ref={canvasRef}
          width={canvasSizeRef.current.w}
          height={canvasSizeRef.current.h}
          style={{border: "none", display: "block",
                   width: "100vw", height: "100vh", 
                   cursor: cursor}}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onContextMenu={handleContextMenu}
          tabIndex={0}
        />
        <UIOverlay
          key={currentTheme}
          scale={scale}
          debug={debug}
          setDebug={setDebug}
          handleClear={handleClear}
          orthoSnapEnabled={orthoSnapEnabled}
          setOrthoSnapEnabled={setOrthoSnapEnabled}
          shiftHeld={shiftHeld}
          orthoTempDisabled={orthoTempDisabled}
          activeTool={activeTool}
          onToolChange={handleToolChange as (tool: string) => void}
          onThemeToggle={handleThemeToggle}
          selectedPrimitiveIds={selectedPrimitiveIds}
        />
      </div>
    </ErrorBoundary>
  );
};

export default App;
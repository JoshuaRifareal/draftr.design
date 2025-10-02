import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import ReactDOM from 'react-dom';
import init from "./pkg/draftr_engine.js";
import UIOverlay from "./components/UIOverlay.js";
import { RenderService } from './services/RenderService';
import { snappingService, contextManager } from './services/SnappingService';
import type { SnapResult } from './services/SnappingService';
import type { SnapType } from './types/ToolTypes.js';
import { ThemeManager, type Theme } from './services/ThemeManager';
import { selectionService } from './services/SelectionService';
import { layerService } from './services/LayerService';
import { appStateStore, type AppState } from './services/AppStateStore';
import { CommandAdapters } from './services/CommandAdapters';
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

  // NEW: USING APPSTATESTORE
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
  const [snapConfig] = useState({ enabled: true });
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

  // Track last ESC press
  const lastEscPressRef = useRef<number>(0);

  // Custom Cursor
  const [isDrawing, setIsDrawing] = useState(false);
  const cursor = useCursor(activeTool, shiftHeld, isDrawing, !!panStart, currentTheme);
  const [globalCursor, setGlobalCursor] = useState<string>(CURSORS.DEFAULT(currentTheme));
  useEffect(() => {
    const activeLayer = layerService.getActiveLayer();
    const isLayerLocked = activeLayer?.properties.locked ?? false;
    
    let newCursor = CURSORS.DEFAULT(currentTheme);
  
    if (panStart) {
      newCursor = CURSORS.PANNING;
    } else if ((activeTool === 'LINE' || activeTool === 'RECTANGLE' || activeTool === 'CIRCLE') && isLayerLocked) {
      newCursor = CURSORS.DISABLED;
    } else if (activeTool === 'SELECTION' && shiftHeld) {
      newCursor = CURSORS.SELECT_SUBTRACT(currentTheme);
    } else if (activeTool === 'LINE' || activeTool === 'RECTANGLE' || activeTool === 'CIRCLE') {
      newCursor = CURSORS.CROSSHAIR;
    }
    setGlobalCursor(newCursor);
  }, [activeTool, shiftHeld, isDrawing, panStart, currentTheme]);

  // 🎯 PERFORMANCE: Add performance monitor
  const performanceMonitor = useRef(new PerformanceMonitor()).current;

  // 🎯 PERFORMANCE: Memoize static configs that never change
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

  // 🎯 PERFORMANCE: Optimize redrawAll with useCallback
  const redrawAll = useCallback((preview: { x: number; y: number } | null, snapResult: SnapResult) => {
    const startTime = performance.now();
    
    if (!serviceRef.current || !canvasRef.current) return;
    const service = serviceRef.current;
    
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
      orthoAnglesDeg: ORTHO_ANGLES_DEG
    });
    
    const duration = performanceMonitor.endMeasurement('redrawAll', startTime);
    performanceMonitor.recordRedraw(duration);
  }, [
    offsetX, offsetY, scale,
    activeTool,
    activeConstraint,
    currentStart,
    selectedPrimitiveIds,
    selectionStart,
    selectionEnd,
    orthoConfigMemo,
  ]);

  // 🎯 PERFORMANCE: Debounced redraw for high-frequency operations
  const debouncedRedraw = useCallback(
    debounce((preview: { x: number; y: number } | null, snapResult: SnapResult) => {
      redrawAll(preview, snapResult);
    }, 16),
    [redrawAll]
  );

  // 🎯 PERFORMANCE: Add performance state and overlay
  const [showPerformance, setShowPerformance] = useState(false);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Error display component
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

  // 🎯 PERFORMANCE: Performance overlay component
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

  // Check if orthogonal snapping should be active
  const shouldUseOrthoSnapping = () => {
    if (shiftHeld) return true;
    return orthoSnapEnabled && !orthoTempDisabled;
  };
  const orthoSnapEnabledRef = useRef(orthoSnapEnabled);
  const snappingServiceRef = useRef(snappingService);

  
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
      
      // 🎯 PERFORMANCE: Add performance testing
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

      ////////// TEST CULLING
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
    }
  }, [serviceRef.current]);

  // Subscribe to AppStateStore changes
  useEffect(() => {
    const unsubscribe = appStateStore.subscribe((newState: AppState) => {
      setAppState(newState);
    });
    return unsubscribe;
  }, []);

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
          e.stopImmediatePropagation(); // 🎯 CRITICAL: Stop other listeners
          
          console.log('⌨️ ESC handled in App.tsx (command bar closed)');
          CommandAdapters.setSelection([]);
          CommandAdapters.setActiveTool('SELECTION');
          resetTool();
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


  ////////// INTERACTION HANDLERS \\\\\\\\\\

  const handleMouseMove = useCallback(
    throttle((evt: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getMousePos(evt);
      
      // 🎯 FIX: Only calculate snap for drawing tools
      let snapResult: SnapResult;
      
      if (activeTool === 'SELECTION') {
        // 🚫 SELECTION MODE: No snapping needed
        snapResult = {
          position: screenToWorld(pos.x, pos.y),
          type: 'none',
          strength: 0
        };
        snapResultRef.current = snapResult; // Update ref but no state
      } else {
        // ✅ DRAWING MODE: Calculate snapping
        snapResult = snappingService.findSnap(pos, contextManager.getContext());
        
        // Hysteresis logic for drawing tools
        if (hysteresisActive && currentSnap?.type === 'vertex') {
          const cursorScreen = pos;
          const snapScreen = worldToScreen(currentSnap.position.x, currentSnap.position.y);
          const screenDistance = Math.sqrt(
            Math.pow(cursorScreen.x - snapScreen.x, 2) + 
            Math.pow(cursorScreen.y - snapScreen.y, 2)
          );
          const UNSNAP_THRESHOLD = SNAP_THRESHOLD * 1.5;
          
          if (screenDistance <= UNSNAP_THRESHOLD) {
            snapResult = {
              position: currentSnap.position,
              type: currentSnap.type,
              metadata: { vertex: currentSnap.position },
              strength: Math.max(0.7, 1 - (screenDistance / UNSNAP_THRESHOLD))
            };
          } else {
            setHysteresisActive(false);
            setCurrentSnap(null);
          }
        }
        
        // Constraint state handling for drawing tools
        if (snapResult.type === 'constraint' && snapResult.metadata?.constraint) {
          CommandAdapters.setActiveConstraint(snapResult.metadata.constraint);
        } else if (snapResult.type === 'intersection' && snapResult.metadata?.constraint) {
          CommandAdapters.setActiveConstraint(snapResult.metadata.constraint);
        } else if (snapResult.type === 'vertex') {
          CommandAdapters.setActiveConstraint(null);
        } else {
          CommandAdapters.setActiveConstraint(null);
        }
        
        // 🎯 FIX: Only update ref for drawing tools (no state updates)
        const prevSnap = snapResultRef.current;
        const hasChanged = prevSnap.type !== snapResult.type || 
                          prevSnap.position.x !== snapResult.position.x || 
                          prevSnap.position.y !== snapResult.position.y ||
                          prevSnap.strength !== snapResult.strength;
        
        if (hasChanged) {
          snapResultRef.current = snapResult;
        }
        
        // Handle temporary disabling for drawing tools
        if (snapResult.type === 'vertex' || hysteresisActive) {
          if (orthoSnapEnabled && !orthoTempDisabled) {
            setOrthoTempDisabled(true);
          }
          if (!constraintTempDisabled && vertexConstraints.length > 0) {
            setConstraintTempDisabled(true);
          }
        } else {
          if (orthoTempDisabled) {
            setOrthoTempDisabled(false);
          }
          if (constraintTempDisabled) {
            setConstraintTempDisabled(false);
          }
        }
      }

      const constraintSnap = snapResult.type === 'constraint' ? snapResult.position : null;
      let intersectionSnap = null;
      let finalPos = snapResult.type === 'vertex' ? snapResult.position : intersectionSnap ?? constraintSnap ?? screenToWorld(pos.x, pos.y);
      let preview = finalPos;

      // Panning functionality
      if (panStart) {
        const dx = (pos.x - panStart.x) / scale;
        const dy = (pos.y - panStart.y) / scale;
        
        CommandAdapters.panImmediate(offsetX + dx, offsetY + dy);
        
        setIsDrawing(false);
        setPanStart({ x: pos.x, y: pos.y });
        debouncedRedraw(previewEnd, snapResultRef.current);
        return;
      }

      // Selection rectangle - IMMEDIATE updates
      if (activeTool === 'SELECTION' && selectionStart) {
        const cursorWorld = screenToWorld(pos.x, pos.y);
        CommandAdapters.updateSelectionRect(selectionStart, cursorWorld);
        redrawAll(previewEnd, snapResultRef.current); // Immediate redraw for selection
        return;
      }

      // Check for vertex hover to toggle constraints (drawing tools only)
      if (activeTool !== 'SELECTION' && snapResult.type === 'vertex' && snapResult.metadata?.vertex && snappingService.getConfig().constraintEnabled) {
        const vertex = snapResult.metadata.vertex;
        const key = getVertexKey(vertex);
        if (!hoveredVerticesRef.current.has(key)) {
          hoveredVerticesRef.current.add(key);
          toggleVertexConstraint(vertex);
        }
      } else {
        hoveredVerticesRef.current.clear();
      }

      if (!currentStart) return;

      // Line preview logic (drawing tools only)
      if (activeTool === 'LINE') {
        if (hysteresisActive && currentSnap?.type === 'vertex') {
          preview = currentSnap.position;
        } else if (snapResult.type === 'vertex' || snapResult.type === 'intersection') {
          if (snapResult.type === 'intersection' && snapResult.strength > 0.1) {
            preview = snapResult.position;
          } else if (snapResult.type === 'vertex') {
            preview = snapResult.position;
          }
        } else if (shiftHeld) {
          const dx = finalPos.x - currentStart.x;
          const dy = finalPos.y - currentStart.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const nearest = nearestOrthoAngleDeg(currentStart, finalPos);
          const rad = (nearest.angle * Math.PI) / 180;
          preview = { x: currentStart.x + Math.cos(rad) * dist, y: currentStart.y + Math.sin(rad) * dist };
        } else if (shouldUseOrthoSnapping() && !orthoTempDisabled) {
          const constrained = applyOrthoConstraint(currentStart, finalPos);
          if (constrained) {
            preview = { x: constrained.x, y: constrained.y };
          }
        } else {
          preview = snapResult.position;
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
    }, 8),
    [
      panStart, activeTool, selectionStart, currentStart, scale, offsetX, offsetY,
      screenToWorld, snappingService, debouncedRedraw, previewEnd,
      hysteresisActive, currentSnap, shiftHeld, orthoSnapEnabled, orthoTempDisabled,
      worldToScreen, SNAP_THRESHOLD, nearestOrthoAngleDeg, applyOrthoConstraint,
      shouldUseOrthoSnapping, getVertexKey, toggleVertexConstraint, vertexConstraints,
      constraintTempDisabled, contextManager, redrawAll
    ]
  );

  const handleMouseDown = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(evt);

    if (evt.button === 0) {
      const activeLayer = layerService.getActiveLayer();
      
      // 🎯 FIX: Only calculate snap for drawing tools
      let snapResult: SnapResult;
      
      if (activeTool === 'SELECTION') {
        // 🚫 SELECTION MODE: No snapping
        snapResult = {
          position: screenToWorld(pos.x, pos.y),
          type: 'none',
          strength: 0
        };
      } else {
        // ✅ DRAWING MODE: Calculate snapping
        snapResult = snappingService.findSnap(pos, contextManager.getContext());
      }
      
      snapResultRef.current = snapResult; // Always update ref
      
      const constraintSnap = snapResult.type === 'constraint' ? snapResult.position : null;
      let intersectionSnap = null;
      let finalPos = snapResult.type === 'vertex' ? snapResult.position : intersectionSnap ?? constraintSnap ?? screenToWorld(pos.x, pos.y);

      // Set drawing state for non-selection tools
      if (activeTool !== 'SELECTION') {
        if (activeLayer && activeLayer.properties.locked) {
          console.log('🚫 Cannot draw on locked layer');
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
          
    } else if (evt.button === 1) {
      setPanStart({ x: pos.x, y: pos.y });
      setIsDrawing(false);
    }
  };

  const handleMouseUp = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    if (evt.button === 0) {
      setIsDrawing(false);
    } else if (evt.button === 1) {
      setPanStart(null);
      CommandAdapters.panFinal(offsetX, offsetY);
      redrawAll(previewEnd, snapResultRef.current);
    }
  };

  const handleContextMenu = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    evt.preventDefault();
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
      
      if (panStart) {
        newCursor = CURSORS.PANNING;
      } else if ((activeTool === 'LINE' || activeTool === 'RECTANGLE' || activeTool === 'CIRCLE') && isLayerLocked) {
        newCursor = CURSORS.DISABLED;
      } else if (activeTool === 'SELECTION' && shiftHeld) {
        newCursor = CURSORS.SELECT_SUBTRACT(newTheme);
      } else {
        newCursor = CURSORS.DEFAULT(newTheme);
      }
      
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
      <div style={{ position: "relative", width: "100vw", height: "100vh", cursor: globalCursor }}>
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
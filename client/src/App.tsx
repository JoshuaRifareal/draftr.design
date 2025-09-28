import React, { useEffect, useRef, useState } from "react";
import init from "./pkg/draftr_engine.js";
import UIOverlay from "./components/UIOverlay.js";
import { RenderService } from './services/RenderService';
import { snappingService, contextManager, type SnapResult, type SnapType } from './services/SnappingService';
import { ThemeManager, type Theme } from './services/ThemeManager';
import { CommandService, type CommandContext } from './services/CommandService';
import { commandDispatcher, type CommandEvent } from './services/CommandDispatcher';
import { selectionService } from './services/SelectionService';
import { layerService } from './services/LayerService';
import type { DrawingPrimitive } from './types/draftrTypes';


// INTERFACES
interface SnapResult {
  position: { x: number; y: number };
  type: 'none' | 'vertex' | 'intersection' | 'constraint' | 'ortho';
  strength: number;
  metadata?: any;
}


// Default Variables
const SNAP_THRESHOLD = 25; // px
const ORTHO_COLOR = { r: 0, g: 255, b: 0, a: 1.0 };
const ORTHO_DASH_PX = 8;
const ORTHO_GAP_PX = 6;
const ORTHO_THICKNESS_PX = 1;
const ORTHO_THRESHOLD_DEG = 5;
const ORTHO_ANGLES_DEG = [0, 45, 90, 135]; // can be changed at runtime
const GRID_COLOR = { r: 0, g: 0, b: 0, a: 0.1 };
const GRID_SPACING_MIN_PX = 25.0;
const GRID_SPACING_MAX_PX = 50.0;
const CANVAS_COLOR = { r: 0.17, g: 0.17, b: 0.19, a: 1.0 }; // Black with slight alpha
const SELECTION_COLOR = { r: 0.0, g: 0.0, b: 1.0, a: 0.25 }; // Blue with 40% alpha


const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const serviceRef = useRef<RenderService | null>(null);
  const [debug, setDebug] = useState(true);

  // Command service setup
  const [commandService, setCommandService] = useState<CommandService | null>(null);

  // Selection service setup
  const [selectedPrimitiveIds, setSelectedPrimitiveIds] = useState<string[]>([]);
  const [shiftHeldForSelection, setShiftHeldForSelection] = useState(false);

  // Initialize theme manager amd color configurations
  const themeManager = useRef(new ThemeManager()).current;
  const [currentTheme, setCurrentTheme] = useState<Theme>('dark');
  const [lineColor, setLineColor] = useState({ r: 1.0, g: 1.0, b: 1.0, a: 1.0 });
  const [snapColor, setSnapColor] = useState({ r: 1.0, g: 0.8, b: 0.0, a: 1.0 });

  // Tool types and states
  type ToolType = 'SELECTION' | 'LINE' | 'RECTANGLE' | 'CIRCLE';
  const [activeTool, setActiveTool] = useState<ToolType>('SELECTION');
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);

  // Line drawing state and style configuration
  // const [lines, setLines] = useState<number[][]>([]);
  const [primitives, setPrimitives] = useState<DrawingPrimitive[]>([]);
  const [currentStart, setCurrentStart] = useState<{ x: number; y: number } | null>(null);
  const [previewEnd, setPreviewEnd] = useState<{ x: number; y: number } | null>(null);
  const [snapConfig] = useState({ enabled: true });

  // Pan/zoom state
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);

  // Snap states
  const [snapResult, setSnapResult] = useState<SnapResult>({
    position: { x: 0, y: 0 },
    type: 'none',
    strength: 0
  });

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

  // Window resize state
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({
    w: typeof window !== "undefined" ? window.innerWidth : 650,
    h: typeof window !== "undefined" ? window.innerHeight : 650,
  });

  // Snap state and Hysteresis
  const [currentSnap, setCurrentSnap] = useState<{
    type: SnapType;
    position: { x: number; y: number };
    strength: number;
  } | null>(null);
  const [hysteresisActive, setHysteresisActive] = useState(false);

  // No snap result helper function
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

  // Vertex constraint state
  const [vertexConstraints, setVertexConstraints] = useState<{x: number, y: number}[]>([]);
  const [activeConstraint, setActiveConstraint] = useState<{x: number, y: number, type: 'horizontal' | 'vertical'} | null>(null);

  // Track hovered vertices for constraint toggling
  const hoveredVerticesRef = useRef<Set<string>>(new Set());



  ////////// INITIALIZAION \\\\\\\\\\\
  useEffect(() => {
    const run = async () => {
      await init();
      if (canvasRef.current) {
        const service = new RenderService(canvasRef.current);
        serviceRef.current = service;
  
        // Set initial transform values
        service.setTransform(offsetX, offsetY, scale);
  
        // Set orthogonal defaults
        service.setOrthoConfig(orthoConfig);
        
        // Set grid defaults  
        service.setGridConfig(gridConfig);

        // Set canvas and selection color
        service.setCanvasColor(
          canvasColor.r, canvasColor.g, canvasColor.b, canvasColor.a
        );
        service.setSelectionColor(
          selectionColor.r, selectionColor.g, selectionColor.b, selectionColor.a
        );
  
        service.clear();
        service.resize(canvasSize.w, canvasSize.h);
        service.drawGrid(offsetX, offsetY, scale);
      }
    };
    run();
  }, []);

  // Expose services to global scope for console testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).layerService = layerService;
      (window as any).selectionService = selectionService;
      (window as any).renderService = serviceRef.current;
      (window as any).commandService = commandService;
    }
  }, [serviceRef.current, commandService]);


  // Command service initialization 
  useEffect(() => {
    if (serviceRef.current) {
      const getCurrentState = () => ({
        primitives: primitives, // ✅ Direct reference (React will provide latest)
        scale: scale,
        offsetX: offsetX,
        offsetY: offsetY,
        activeTool: activeTool,
        selectionStart: selectionStart,
        selectionEnd: selectionEnd,
        currentStart: currentStart,
        previewEnd: previewEnd,
        selectedPrimitiveIds: selectedPrimitiveIds,
      });

      const context: CommandContext = {
        renderService: serviceRef.current,
        snappingService: snappingService,
        selectionService: selectionService,
        layerService: layerService,
        stateSetters: {
          setPrimitives: (newPrimitives) => {
            setPrimitives(newPrimitives);
          },
          setScale,
          setOffsetX,
          setOffsetY,
          setActiveTool: setActiveTool as (tool: string) => void,
          setSelectionStart,
          setSelectionEnd,
          setCurrentStart,
          setPreviewEnd,
          setSelectedPrimitiveIds,
        },
        getCurrentState
      };
        
      const newCommandService = new CommandService(context, layerService);
      setCommandService(newCommandService);
    }
  }, [serviceRef.current, primitives.length]);
  
  // Subsrcibe and unsubscribe from command dispatcher
  useEffect(() => {
    if (!commandService) return;
    
    const unsubscribe = commandDispatcher.subscribe((event: CommandEvent) => {
      if (event.type === 'EXECUTE_COMMAND') {
        commandService.execute(event.commandId, event.params)
          .catch((error: Error) => console.error('Command failed:', error));
      }
    });
    
    return unsubscribe;
  }, [commandService]);


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
      redrawAll(previewEnd, snapResult);
    }
  }, [canvasColor, selectionColor]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setCanvasSize({ w, h });
      if (canvasRef.current) {
        canvasRef.current.width = w * window.devicePixelRatio; // ✅ Handle high-DPI
        canvasRef.current.height = h * window.devicePixelRatio;
        canvasRef.current.style.width = w + 'px';
        canvasRef.current.style.height = h + 'px';
      }
      if (serviceRef.current) {
        serviceRef.current.resize(w, h);
        redrawAll(previewEnd, snapResult);
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [primitives, scale, offsetX, offsetY, previewEnd, snapResult, orthoConfig, shiftHeld, orthoSnapEnabled, orthoTempDisabled, vertexConstraints, activeConstraint, gridConfig]);

  // Keyboard listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F8" || e.key === "F9" || e.key === "F10") {
        e.preventDefault();
      }

      if (e.key === "Shift") setShiftHeld(true);
      if (e.key === "F8") {
        e.preventDefault();
        const newOrthoEnabled = !orthoSnapEnabled;
        setOrthoSnapEnabled(newOrthoEnabled);
        
        snappingService.updateConfig({
          orthoEnabled: newOrthoEnabled
        });
        
        logDebug("Ortho snap toggled:", newOrthoEnabled);
      }
      if (e.key === "F9") {
        e.preventDefault();
        const newConstraintEnabled = !snappingService.getConfig().constraintEnabled;
        
        snappingService.updateConfig({ 
          constraintEnabled: newConstraintEnabled 
        });

        if (!newConstraintEnabled) {
          setVertexConstraints([]);
          setActiveConstraint(null);
          hoveredVerticesRef.current.clear();
        }
        logDebug("Constraint snap toggled:", newConstraintEnabled);
      }
      if (e.key === "F10") {
        e.preventDefault();
        handleThemeToggle();
      }
      if (e.key === "Escape") {
        setSelectedPrimitiveIds([]);
        resetTool();
        setActiveTool('SELECTION');
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" || e.key === "Z") {
          e.preventDefault();
          if (commandService) {
            if (e.shiftKey) {
              commandService.redo(); // Ctrl+Shift+Z for redo
              console.log("🔁 Redo triggered");
            } else {
              commandService.undo(); // Ctrl+Z for undo
              console.log("⏪ Undo triggered");
            }
          }
        }
        if (e.key === "y" || e.key === "Y") {
          e.preventDefault();
          if (commandService) {
            commandService.redo(); // Ctrl+Y for redo
            console.log("🔁 Redo triggered");
          }
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [commandService, orthoSnapEnabled]);

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

      setScale(newScale);
      setOffsetX(newOffsetX);
      setOffsetY(newOffsetY);

      redrawAll(previewEnd, snapResult);
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [scale, offsetX, offsetY, previewEnd, primitives, currentStart, debug, snapResult, orthoConfig, shiftHeld, orthoSnapEnabled, orthoTempDisabled]);

  // Redraw all states
  useEffect(() => {
    redrawAll(previewEnd, snapResult);
  }, [primitives, scale, offsetX, offsetY, previewEnd, 
      lineColor, snapColor, snapResult, orthoConfig, 
      shiftHeld, orthoSnapEnabled, orthoTempDisabled, 
      vertexConstraints, activeConstraint, gridConfig, 
      canvasColor, selectionColor, currentTheme]);

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
    
    const key = getVertexKey(vertex);
    setVertexConstraints(prev => {
      const exists = prev.some(v => getVertexKey(v) === key);
      if (exists) {
        return prev.filter(v => getVertexKey(v) !== key);
      } else {
        return [...prev, vertex];
      }
    });
  };

  // Snapping logic
  const findSnap = (pos: { x: number; y: number }): SnapResult => {
    if (!snapConfig.enabled || activeTool === 'SELECTION') {
      const result: SnapResult = {
        position: screenToWorld(pos.x, pos.y),
        type: 'none',
        strength: 0
      };
      setSnapResult(result);
      setActiveConstraint(null);
      setHysteresisActive(false);
      setCurrentSnap(null);
      return result;
    }
  
    const result = snappingService.findSnap(pos, contextManager.getContext());
  
    // Hysteresis state management
    if (hysteresisActive && currentSnap?.type === 'vertex') {
      const cursorScreen = pos;
      const snapScreen = worldToScreen(currentSnap.position.x, currentSnap.position.y);
      const screenDistance = Math.sqrt(
        Math.pow(cursorScreen.x - snapScreen.x, 2) + 
        Math.pow(cursorScreen.y - snapScreen.y, 2)
      );
      const UNSNAP_THRESHOLD = SNAP_THRESHOLD * 1.5;
      
      if (screenDistance <= UNSNAP_THRESHOLD) {
        const stickResult: SnapResult = {
          position: currentSnap.position,
          type: currentSnap.type,
          metadata: { vertex: currentSnap.position },
          strength: Math.max(0.7, 1 - (screenDistance / UNSNAP_THRESHOLD))
        };
        
        setSnapResult(stickResult);
        return stickResult;
      } else {
        setHysteresisActive(false);
        setCurrentSnap(null);
      }
    }
  
    // Activate or deactivate hysteresis
    if (result.type === 'vertex') {
      console.log("🚀 Hysteresis activated")
      setHysteresisActive(true);
      setCurrentSnap({
        type: result.type,
        position: result.position,
        strength: result.strength
      });
    } else {
      if (hysteresisActive) {
        console.log('🔄 Clearing hysteresis');
        setHysteresisActive(false);
        setCurrentSnap(null);
      }
    }
  
    // Handle constraint state
    if (result.type === 'constraint' && result.metadata?.constraint) {
      setActiveConstraint(result.metadata.constraint);
    } else if (result.type === 'intersection' && result.metadata?.constraint) {
      setActiveConstraint(result.metadata.constraint);
    } else if (result.type === 'vertex') {
      setActiveConstraint(null);
    } else {
      setActiveConstraint(null);
    }
  
    // Handle temporary disabling
    if (result.type === 'vertex' || hysteresisActive) {
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
    setSnapResult(result);
    return result;
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
    // Hard override with Shift key (temporary orthogonal snapping)
    if (shiftHeld) return true;
    
    // Normal orthogonal snapping (if enabled and not temporarily disabled due to vertex priority)
    return orthoSnapEnabled && !orthoTempDisabled;
  };

  // Redraw call from renderservice
  const redrawAll = (preview: { x: number; y: number } | null, snapResult: SnapResult) => {
    if (!serviceRef.current || !canvasRef.current) return;
    const service = serviceRef.current;
    
    // Layer-aware redraw method
    service.redrawAll(preview, snapResult, {
      offsetX, offsetY, scale,
      activeTool, 
      activeConstraint, 
      constraintColor,
      currentStart, 
      orthoConfig, 
      vertexConstraints,
      selectedPrimitiveIds, 
      selectionStart, 
      selectionEnd,
      lineColor, 
      snapColor,
      orthoThresholdDeg: ORTHO_THRESHOLD_DEG,
      orthoAnglesDeg: ORTHO_ANGLES_DEG
    });
  };



  ////////// INTERACTION \\\\\\\\\\\
  const handleMouseDown = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(evt);
    const worldPos = screenToWorld(pos.x, pos.y);

    if (evt.button === 0) {
      const activeLayer = layerService.getActiveLayer();
      const snapResult = findSnap(pos);
      const constraintSnap = snapResult.type === 'constraint' ? snapResult.position : null;
      let intersectionSnap = null;
      const cursorWorld = constraintSnap ?? (snapResult.type !== 'none' ? snapResult.position : screenToWorld(pos.x, pos.y));
      let finalPos = snapResult.type === 'vertex' ? snapResult.position : intersectionSnap ?? constraintSnap ?? screenToWorld(pos.x, pos.y);

      // Find intersection when currently drawing 
      if (currentStart) {
        intersectionSnap = snapResult.type === 'intersection' ? snapResult.position : null;
      }

      // Selection tool capture cursor
      if (activeTool === 'SELECTION') {
        if (selectionStart === null) {
          setSelectionStart(worldPos);
          setSelectionEnd(worldPos);

          // Clear previous selection if not holding shift
          if (!shiftHeld) {
            setSelectedPrimitiveIds([]);
          }
          setShiftHeldForSelection(shiftHeld);
        } else {
          setSelectionEnd(worldPos);
          
          // Finalize selection
          if (selectionStart && selectionEnd) {
            const result = selectionService.selectByRectangle(
              selectionStart, 
              selectionEnd, 
              shiftHeldForSelection ? selectedPrimitiveIds : []
            );

            // console.log('Selected IDs:', result.selectedIds);
            setSelectedPrimitiveIds(result.selectedIds);
          }

          setSelectionStart(null);
          setSelectionEnd(null);
          resetTool();
        }
        return;
      }

      // Rectangle tool define corners
      if (activeTool === 'RECTANGLE') {
        const cursorWorld = snapResult.type !== 'none' ? snapResult.position : screenToWorld(pos.x, pos.y);

        if (!currentStart) {
          // First corner
          setCurrentStart(cursorWorld);
        } else {
          // Finalize rectangle
          const newPrimitive: DrawingPrimitive = {
            id: `primitive-${crypto.randomUUID()}`,
            type: 'rectangle',
            data: [currentStart.x, currentStart.y, cursorWorld.x, cursorWorld.y, 
                   lineColor.r, lineColor.g, lineColor.b, lineColor.a],
            layerId: layerService.getActiveLayerId()
          };
          setPrimitives(prev => [...prev, newPrimitive]);

          resetTool();
          setCurrentStart(null);
          setPreviewEnd(null);
          setSelectionStart(null);
          setSelectionEnd(null);
          setVertexConstraints([]);
          setActiveConstraint(null);
          hoveredVerticesRef.current.clear();
        }
        return;
      }

      // Draw Preview Line
      if (previewEnd) {
        // Use previewEnd if available
        finalPos = previewEnd;
      } else if (shiftHeld && previewEnd) {
        // Endpoint is constrained to lie along the guideline
        finalPos = previewEnd;
      } else if (!shiftHeld && currentStart && shouldUseOrthoSnapping()) {
        const cursorWorld = screenToWorld(pos.x, pos.y);
        const constrained = applyOrthoConstraint(currentStart, cursorWorld);
        if (constrained) {
          finalPos = { x: constrained.x, y: constrained.y };
        }
      }

      // Draw Line - FIXED VERSION
      if (!currentStart) {
        if (activeLayer && activeLayer.properties.locked) {
          console.warn("🚫 Cannot draw on locked layer:", activeLayer.name);
          return; 
        }
        setCurrentStart(finalPos);
      } else {
        const newPrimitive: DrawingPrimitive = {
          id: `primitive-${crypto.randomUUID()}`,
          type: 'line',
          data: [currentStart.x, currentStart.y, finalPos.x, finalPos.y, 
                lineColor.r, lineColor.g, lineColor.b, lineColor.a],
          layerId: layerService.getActiveLayerId()
        };

        // ALWAYS use command service when available
        if (commandService) {
          commandService.execute('draw-line', { primitive: newPrimitive })
            .then(() => {
              console.log('✅ Line drawn via command system');
            })
            .catch(error => {
              console.error('❌ Command failed, falling back to direct state:', error);
              // Fallback: update state directly if command fails
              setPrimitives(prev => [...prev, newPrimitive]);
            });
        } else {
          console.log('⚡ Using direct state (fallback)');
          setPrimitives(prev => [...prev, newPrimitive]);
        }

        setCurrentStart(finalPos);
        setPreviewEnd(null);

        // Clear constraints when finalizing an endpoint
        setVertexConstraints([]);
        setActiveConstraint(null);
        hoveredVerticesRef.current.clear();
      }
          
    } else if (evt.button === 1) {
      setPanStart({ x: pos.x, y: pos.y });
    }
  };
  const handleMouseMove = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(evt);
    const currentSnapResult = findSnap(pos);
    const constraintSnap = currentSnapResult.type === 'constraint' ? currentSnapResult.position : null;
    const cursorWorld = constraintSnap ?? 
                       (currentSnapResult.type !== 'none' ? currentSnapResult.position : screenToWorld(pos.x, pos.y));
    const intersectionSnap = currentSnapResult.type === 'intersection' ? currentSnapResult.position : null;
    let preview = cursorWorld;


    // Panning functionality
    if (panStart) {
      const dx = (pos.x - panStart.x) / scale;
      const dy = (pos.y - panStart.y) / scale;
      setOffsetX((ox) => ox + dx);
      setOffsetY((oy) => oy + dy);
      setPanStart({ x: pos.x, y: pos.y });
      redrawAll(previewEnd, currentSnapResult);
      return;
    }

    // Selection rectangle
    if (activeTool === 'SELECTION' && selectionStart) {
      const cursorWorld = screenToWorld(pos.x, pos.y);
      setSelectionEnd(cursorWorld);
      redrawAll(previewEnd, currentSnapResult);
      return;
    }

    // Check for vertex hover to toggle constraints
    if (currentSnapResult.type === 'vertex' && currentSnapResult.metadata?.vertex && snappingService.getConfig().constraintEnabled) {
      const vertex = currentSnapResult.metadata.vertex;
      const key = getVertexKey(vertex);
      if (!hoveredVerticesRef.current.has(key)) {
        hoveredVerticesRef.current.add(key);
        toggleVertexConstraint(vertex);
      }
    } else {
      hoveredVerticesRef.current.clear();
    }

    if (!currentStart) return;

    // 1. ABSOLUTE HIGHEST PRIORITY: Hysteresis override
    if (hysteresisActive && currentSnap?.type === 'vertex') {
      preview = currentSnap.position;
    } 
    // 2. HIGH PRIORITY: Vertex or intersection snaps (when not in hysteresis)
    else if (currentSnapResult.type === 'vertex' || currentSnapResult.type === 'intersection') {
      if (currentSnapResult.type === 'intersection' && currentSnapResult.strength > 0.1) {
        preview = currentSnapResult.position;
      } else if (currentSnapResult.type === 'vertex') {
        preview = currentSnapResult.position;
      }
    } 
    // 3. MEDIUM PRIORITY: Shift-held ortho snapping (user override)
    else if (shiftHeld) {
      // Hard snapping override with Shift key
      const dx = cursorWorld.x - currentStart.x;
      const dy = cursorWorld.y - currentStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const nearest = nearestOrthoAngleDeg(currentStart, cursorWorld);
      const rad = (nearest.angle * Math.PI) / 180;
      preview = { x: currentStart.x + Math.cos(rad) * dist, y: currentStart.y + Math.sin(rad) * dist };
    } 
    // 4. LOW PRIORITY: Normal ortho snapping (if enabled and not temporarily disabled)
    else if (shouldUseOrthoSnapping() && !orthoTempDisabled) {
      const constrained = applyOrthoConstraint(currentStart, cursorWorld);
      if (constrained) {
        preview = { x: constrained.x, y: constrained.y };
      } else {
      }
    }
    // 5. FALLBACK: Use whatever snap result we have
    else {
      preview = currentSnapResult.position;
    }

    // Render ortho guidelines
    if (serviceRef.current) {
      serviceRef.current.setOrthoConfig(orthoConfig);
    }

    setPreviewEnd(preview);
    redrawAll(preview, currentSnapResult);
  };
  const handleMouseUp = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    if (evt.button === 1) {
      setPanStart(null);
    }
  };
  const handleContextMenu = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    evt.preventDefault();
    resetTool();
  };
  const handleClear = () => {
    console.log('CANVAS CLEARED');
    setPrimitives([]);
    setVertexConstraints([]);
    resetTool();
    serviceRef.current?.clear();
  };
  const handleToolChange = (tool: ToolType) => {
    setActiveTool(tool);
    setSelectedPrimitiveIds([]);
    resetTool();
  };
  const resetTool = () => {
    setCurrentStart(null);
    setPreviewEnd(null);
    setActiveConstraint(null);
    setVertexConstraints([]);
    setSelectionStart(null);
    setSelectionEnd(null);
    setSnapResult(createNoSnapResult());
    setHysteresisActive(false);
    setCurrentSnap(null);
    hoveredVerticesRef.current.clear();

    // Reset temporary ortho disable state when exiting line mode
    if (orthoTempDisabled) {
      setOrthoTempDisabled(false);
    }
    redrawAll(null, createNoSnapResult());
  };
  const handleThemeToggle = () => {
    const newTheme = themeManager.getCurrentTheme() === 'dark' ? 'light' : 'dark';
    themeManager.setTheme(newTheme);
    setCurrentTheme(newTheme);
  
    const currentColors = themeManager.getCurrentColors();

    // Update render service immediately
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
    }

    // Update all rendering colors from theme
    setConstraintColor(currentColors.constraintColor);
    setOrthoConfig(prev => ({ ...prev, color: currentColors.orthoColor }));
    setGridConfig(prev => ({ ...prev, color: currentColors.gridColor }));
    setCanvasColor(currentColors.canvasColor);
    setSelectionColor(currentColors.selectionColor);
    setLineColor(currentColors.lineColor);
    setSnapColor(currentColors.snapColor);
    
    // Immediate redraw
    redrawAll(previewEnd, snapResult);
  };



  ////////// INTERFACE \\\\\\\\\\\
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        style={{ border: "none", display: "block", width: "100vw", height: "100vh", cursor: panStart ? "grabbing" : activeTool === 'SELECTION' ? "default" : "crosshair"  }}
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
        onToolChange={handleToolChange}
        onThemeToggle={handleThemeToggle}
        selectedPrimitiveIds={selectedPrimitiveIds}
      />
    </div>
  );
};

export default App;
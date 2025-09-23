import React, { useEffect, useRef, useState } from "react";
import init, { Renderer } from "./pkg/draftr_engine.js";
import UIOverlay from "./UIOverlay";

// Default snapping config
const SNAP_THRESHOLD = 25; // px
const SNAP_INDICATOR_RADIUS = 4; // px
const CROSS_INDICATOR_SIZE = 8; // px
const CONSTRAINT_COLOR = { r: 128, g: 0, b: 128, a: 1.0 }; // dark purple/violet

// Default orthogonal config
const ORTHO_COLOR = { r: 0, g: 255, b: 0, a: 1.0 };
const ORTHO_DASH_PX = 8;
const ORTHO_GAP_PX = 6;
const ORTHO_THICKNESS_PX = 1;
const ORTHO_THRESHOLD_DEG = 5;
const ORTHO_ANGLES_DEG = [0, 45, 90, 135]; // can be changed at runtime

// Default grid config
const GRID_COLOR = { r: 0, g: 0, b: 0, a: 0.2 };
const GRID_SPACING_MIN_PX = 12.0;
const GRID_SPACING_MAX_PX = 50.0;


const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);

  // Tool types and states
  type ToolType = 'SELECTION' | 'LINE' | 'RECTANGLE' | 'CIRCLE';
  const [activeTool, setActiveTool] = useState<ToolType>('SELECTION');
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);

  // Line drawing state
  const [lines, setLines] = useState<number[][]>([]);
  const [currentStart, setCurrentStart] = useState<{ x: number; y: number } | null>(null);
  const [previewEnd, setPreviewEnd] = useState<{ x: number; y: number } | null>(null);
  const [snapConfig] = useState({ enabled: true });

  // Pan/zoom state
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);

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

  // Window resize state
  const [debug, setDebug] = useState(true);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({
    w: typeof window !== "undefined" ? window.innerWidth : 650,
    h: typeof window !== "undefined" ? window.innerHeight : 650,
  });

  // Persistent snap point
  const [snapPoint, setSnapPoint] = useState<{ x: number; y: number } | null>(null);

  // Shift-key orthogonal mode
  const [shiftHeld, setShiftHeld] = useState(false);

  // Orthogonal snapping toggle state
  const [orthoSnapEnabled, setOrthoSnapEnabled] = useState(true);
  
  // Temporarily disabling ortho snapping based on vertex priority
  const [orthoTempDisabled, setOrthoTempDisabled] = useState(false);
  const orthoPrevStateRef = useRef<boolean>(true);

  // Temporarily disabling constraint snapping based on vertex priority
  const [constraintTempDisabled, setConstraintTempDisabled] = useState(false);
  const constraintPrevStateRef = useRef<boolean>(true);

  // Vertex constraint state
  const [vertexConstraints, setVertexConstraints] = useState<{x: number, y: number}[]>([]);
  const [activeConstraint, setActiveConstraint] = useState<{x: number, y: number, type: 'horizontal' | 'vertical'} | null>(null);

  // Track hovered vertices for constraint toggling
  const hoveredVerticesRef = useRef<Set<string>>(new Set());

  // Track last guide active state so we can only console.log on changes
  const guideActiveRef = useRef<boolean>(false);

  // Initial Run
  useEffect(() => {
    const run = async () => {
      await init();
      if (canvasRef.current) {
        const renderer = new Renderer(canvasRef.current);
        rendererRef.current = renderer;

        // Set initial transform values
        renderer.offset_x = offsetX;
        renderer.offset_y = offsetY;
        renderer.scale = scale;

        const r = (rendererRef.current as unknown as any);
        if (r) {
          // Set orthogonal defaults
          r.setOrthoColor(orthoConfig.color.r, orthoConfig.color.g, orthoConfig.color.b, orthoConfig.color.a);
          r.setOrthoDash(orthoConfig.dashPx, orthoConfig.gapPx);
          r.setOrthoThickness(orthoConfig.thicknessPx);
          r.setOrthoThresholdDeg(orthoConfig.thresholdDeg);
          r.setOrthoAngles(new Float32Array(orthoConfig.anglesDeg));

          // Set grid defaults
          r.setGridColor(gridConfig.color.r, gridConfig.color.g, gridConfig.color.b, gridConfig.color.a);
          r.setGridSpacing(gridConfig.spacingMin, gridConfig.spacingMax);
        }

        renderer.clear();
        renderer.resize(canvasSize.w, canvasSize.h);
        renderer.draw_grid(offsetX, offsetY, scale);
      }
    };
    run();
  }, []);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setCanvasSize({ w, h });
      if (canvasRef.current) {
        canvasRef.current.width = w;
        canvasRef.current.height = h;
      }
      if (rendererRef.current) {
        rendererRef.current.resize(w, h);
        redrawAll(previewEnd, snapPoint);
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [lines, scale, offsetX, offsetY, previewEnd, snapPoint, orthoConfig, shiftHeld, orthoSnapEnabled, orthoTempDisabled, vertexConstraints, activeConstraint, gridConfig]);

  // Keyboard listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(true);
      if (e.key === "F8") {
        e.preventDefault();
        setOrthoSnapEnabled(prev => !prev);
        logDebug("Ortho snap toggled:", !orthoSnapEnabled);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [orthoSnapEnabled]);

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

      newScale = Math.max(0.05, Math.min(20000, newScale)); // Limit scale between 0 and 20000 (2 million %)

      const newOffsetX = pos.x / newScale - worldBeforeX;
      const newOffsetY = pos.y / newScale - worldBeforeY;

      setScale(newScale);
      setOffsetX(newOffsetX);
      setOffsetY(newOffsetY);

      logDebug("zoom ->", Math.round(newScale * 100) + "%", "offset", newOffsetX, newOffsetY);

      redrawAll(previewEnd, snapPoint);
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [scale, offsetX, offsetY, previewEnd, lines, currentStart, debug, snapPoint, orthoConfig, shiftHeld, orthoSnapEnabled, orthoTempDisabled]);

  // Redraw all states
  useEffect(() => {
    redrawAll(previewEnd, snapPoint);
  }, [lines, scale, offsetX, offsetY, previewEnd, snapPoint, orthoConfig, shiftHeld, orthoSnapEnabled, orthoTempDisabled, vertexConstraints, activeConstraint, gridConfig]);

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

  const getMousePos = (evt: MouseEvent | React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  };

  // Generate a unique key for a vertex
  const getVertexKey = (vertex: { x: number; y: number }) => {
    return `${vertex.x.toFixed(4)},${vertex.y.toFixed(4)}`;
  };

  // Toggle vertex constraint
  const toggleVertexConstraint = (vertex: { x: number; y: number }) => {
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
  const findSnap = (pos: { x: number; y: number }) => {
    let closest: { x: number; y: number } | null = null;
    let minDist = SNAP_THRESHOLD;

    // return null if snap disabled OR using Selection tool
    if (!snapConfig.enabled || activeTool === 'SELECTION') {
      setSnapPoint(null);
      return null;
    }

    // prioritize vertex snapping
    for (const line of lines.slice(0, lines.length - 1)) {
      const pts = [
        { x: line[0], y: line[1] },
        { x: line[2], y: line[3] },
      ];
      for (const pt of pts) {
        const screenPt = worldToScreen(pt.x, pt.y);
        const dx = screenPt.x - pos.x;
        const dy = screenPt.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          closest = pt;
        }
      }
    }
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      const firstPointOfLastLine = { x: lastLine[0], y: lastLine[1] };
      const screenPt = worldToScreen(firstPointOfLastLine.x, firstPointOfLastLine.y);
      const dx = screenPt.x - pos.x;
      const dy = screenPt.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        closest = firstPointOfLastLine;
      }
    }

    // temporarily disable orthogonal and constraint snapping
    if (closest) {
      setSnapPoint(closest);
      
      // Temporarily disable ortho 
      if (orthoSnapEnabled && !orthoTempDisabled) {
        orthoPrevStateRef.current = orthoSnapEnabled;
        setOrthoTempDisabled(true);
        logDebug("Vertex snap found, temporarily disabling ortho snapping");
      }

      // Temporarily disable constraint snapping
      if (!constraintTempDisabled && vertexConstraints.length > 0) {
        constraintPrevStateRef.current = activeConstraint !== null; // Store if constraint was active
        setConstraintTempDisabled(true);
        setActiveConstraint(null); // Deactivate any current constraint
        logDebug("Vertex snap found, temporarily disabling constraint snapping");
      }
      
      logDebug("snap to vertex", closest);
      return closest; // Exit early if vertex snap is found
    } else {
      // Restore ortho snapping
      if (orthoTempDisabled) {
        setOrthoTempDisabled(false);
        if (orthoPrevStateRef.current) {
          logDebug("No vertex snap, restoring ortho snapping");
        }
      }

      // Restore constraint snapping
      if (constraintTempDisabled) {
        setConstraintTempDisabled(false);
        if (constraintPrevStateRef.current) {
          logDebug("No vertex snap, restoring constraint snapping");
        }
      }

      // Clear snap point when no vertex is within threshold
      setSnapPoint(null);
    }

    return null;
  };

  // Find intersection between orthogonal guide and active constraint
  const findIntersectionSnap = (start: { x: number; y: number } | null, cursorWorld: { x: number; y: number }) => {
    if (!start || !activeConstraint || !shouldUseOrthoSnapping()) return null;
    if (!activeConstraint || !shouldUseOrthoSnapping()) return null;
    
    const nearest = nearestOrthoAngleDeg(start, cursorWorld);
    if (nearest.diff > orthoConfig.thresholdDeg) return null;
    
    // Calculate orthogonal line equation: y = mx + b
    const angleRad = (nearest.angle * Math.PI) / 180;
    const m = Math.tan(angleRad);
    const b = start.y - m * start.x;
    
    // Calculate intersection with constraint
    let intersection: { x: number; y: number } | null = null;
    
    if (activeConstraint.type === 'horizontal') {
      // Horizontal constraint: y = constraintY
      intersection = {
        x: (activeConstraint.y - b) / m,
        y: activeConstraint.y
      };
    } else {
      // Vertical constraint: x = constraintX
      intersection = {
        x: activeConstraint.x,
        y: m * activeConstraint.x + b
      };
    }
    
    // Check if intersection is close to cursor
    const dx = intersection.x - cursorWorld.x;
    const dy = intersection.y - cursorWorld.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const INTERSECTION_THRESHOLD = SNAP_THRESHOLD / scale;
    
    if (dist < INTERSECTION_THRESHOLD) {
      return intersection;
    }
    
    return null;
  };

  // Check for constraint snapping
  const findConstraintSnap = (pos: { x: number; y: number }) => {
    
    if (activeTool === 'SELECTION') {
      setActiveConstraint(null);
      return null;
    }
    if (constraintTempDisabled) {
      return null;
    }
    if (!snapConfig.enabled || vertexConstraints.length === 0) {
      setActiveConstraint(null);
      return null;
    }

    const cursorWorld = screenToWorld(pos.x, pos.y);
    let closestConstraint: { x: number, y: number, type: 'horizontal' | 'vertical', distance: number } | null = null;
    const CONSTRAINT_THRESHOLD = SNAP_THRESHOLD / scale;

    for (const constraint of vertexConstraints) {
      // Check horizontal constraint (y alignment)
      const horizontalDist = Math.abs(cursorWorld.y - constraint.y);
      if (horizontalDist < CONSTRAINT_THRESHOLD) {
        if (!closestConstraint || horizontalDist < closestConstraint.distance) {
          closestConstraint = { 
            x: constraint.x, 
            y: constraint.y, 
            type: 'horizontal', 
            distance: horizontalDist 
          };
        }
      }

      // Check vertical constraint (x alignment)
      const verticalDist = Math.abs(cursorWorld.x - constraint.x);
      if (verticalDist < CONSTRAINT_THRESHOLD) {
        if (!closestConstraint || verticalDist < closestConstraint.distance) {
          closestConstraint = { 
            x: constraint.x, 
            y: constraint.y, 
            type: 'vertical', 
            distance: verticalDist 
          };
        }
      }
    }

    if (closestConstraint) {
      setActiveConstraint(closestConstraint);
      // Return the constrained position
      if (closestConstraint.type === 'horizontal') {
        return { x: cursorWorld.x, y: closestConstraint.y };
      } else {
        return { x: closestConstraint.x, y: cursorWorld.y };
      }
    } else {
      setActiveConstraint(null);
      return null;
    }
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

  // Redraw logic
  const redrawAll = (preview: { x: number; y: number } | null, snap: { x: number; y: number } | null) => {
    if (!rendererRef.current || !canvasRef.current) return;
    const renderer = rendererRef.current;
    renderer.offset_x = offsetX;
    renderer.offset_y = offsetY;
    renderer.scale = scale;

    renderer.clear();
    renderer.draw_grid(offsetX, offsetY, scale);

    // Draw constraint guides first (behind everything)
    if (activeTool !== 'SELECTION' && activeConstraint) {
      const r = (rendererRef.current as unknown as any);
      r.draw_constraint_guide(
        activeConstraint.x, 
        activeConstraint.y, 
        activeConstraint.type === 'horizontal',
        CONSTRAINT_COLOR.r, CONSTRAINT_COLOR.g, CONSTRAINT_COLOR.b, CONSTRAINT_COLOR.a
      );
    }

    // Draw orthogonal guides next
    if (currentStart && preview && shouldUseOrthoSnapping()) {
      const nearest = nearestOrthoAngleDeg(currentStart, preview);
      const guideActive = nearest.diff <= orthoConfig.thresholdDeg;

      if (guideActiveRef.current !== guideActive) {
        guideActiveRef.current = guideActive;
        if (guideActive) {
          console.log(`Ortho guide active: angle=${nearest.angle}°, diff=${nearest.diff.toFixed(2)}°`);
        } else {
          console.log("Ortho guide inactive");
        }
      }

      if (guideActive) {
        const rad = (nearest.angle * Math.PI) / 180;
        const r = (rendererRef.current as unknown as any);
        r.drawOrthoGuide(currentStart.x, currentStart.y, rad);
      }
    } else {
      if (guideActiveRef.current) {
        guideActiveRef.current = false;
        console.log("Ortho guide inactive");
      }
    }

    // Draw all existing lines
    for (const line of lines) {
      renderer.draw_line(line[0], line[1], line[2], line[3], line[4], line[5], line[6], 1.0);
    }

    // Draw cross indicators for vertex constraints
    if (activeTool !== 'SELECTION') {
      for (const constraint of vertexConstraints) {
        const r = (rendererRef.current as unknown as any);
        r.draw_cross(
          constraint.x, 
          constraint.y, 
          CROSS_INDICATOR_SIZE,
          1, 0, 0, 1.0 // Red cross indicators
        );
      }
    }

    // Draw selection rectangle if in selection mode
    if (activeTool === 'SELECTION' && selectionStart && selectionEnd) {
      const r = (rendererRef.current as unknown as any);
      r.draw_selection_rectangle(
        selectionStart.x, 
        selectionStart.y, 
        selectionEnd.x, 
        selectionEnd.y
      );
    }

    // Draw preview line
    if (currentStart && preview) {
      renderer.draw_line(currentStart.x, currentStart.y, preview.x, preview.y, 0, 0, 0, 1.0);
    }

    // Draw snap point indicator
    const snapToDraw = snap ?? snapPoint;
    if (snapToDraw) {
      renderer.draw_circle(snapToDraw.x, snapToDraw.y, SNAP_INDICATOR_RADIUS, 1, 0, 0, 1.0, 16, true);
    }
  };

  /// Mouse, Keyboard and State handlers
  const handleMouseDown = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(evt);

    if (evt.button === 0) {
      const snap = findSnap(pos);
      const constraintSnap = findConstraintSnap(pos);
      const cursorWorld = constraintSnap ?? snap ?? screenToWorld(pos.x, pos.y);
      let intersectionSnap = null;

      if (currentStart) {
        intersectionSnap = findIntersectionSnap(currentStart, cursorWorld);
      }

      //  selection tool capture cursor
      if (activeTool === 'SELECTION') {
        if (selectionStart === null) {
          setSelectionStart(screenToWorld(pos.x, pos.y));
          setSelectionEnd(screenToWorld(pos.x, pos.y));
        } else {
          setSelectionEnd(screenToWorld(pos.x, pos.y));
          
          if (selectionEnd) {
            // process selection here before clearing
            console.log("Finalizing selection:", { selectionStart, selectionEnd });
            
          }

          setSelectionStart(null);
          setSelectionEnd(null);
          resetTool();
        }
        return;
      }

      // rectangle tool define corners
      if (activeTool === 'RECTANGLE') {
        const snap = findSnap(pos);
        const constraintSnap = findConstraintSnap(pos);
        const cursorWorld = constraintSnap ?? snap ?? screenToWorld(pos.x, pos.y);

        if (!currentStart) {
          // First corner
          setCurrentStart(cursorWorld);
        } else {
          // Finalize rectangle
          setLines((prev) => {
            const newRect = [
              currentStart.x, currentStart.y,
              cursorWorld.x, cursorWorld.y,
              0, 0, 0
            ];
            return [...prev, newRect];
          });
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

      // snapping priority (highest to lowest)
      let finalPos = snap ?? intersectionSnap ?? constraintSnap ?? screenToWorld(pos.x, pos.y);

      // finalize endpoint and preview
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

      if (!currentStart) {
        setCurrentStart(finalPos);
        logDebug("start line at", finalPos);
      } else {
        setLines((prev) => {
          const newLine = [currentStart.x, currentStart.y, finalPos.x, finalPos.y, 0, 0, 0];
          logDebug("commit line", newLine);
          return [...prev, newLine];
        });
        setCurrentStart(finalPos);
        setPreviewEnd(null);

        // clear constraints when finalizing an endpoint
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
    // Check for vertex hover to toggle constraints
    const snap = findSnap(pos);
    const constraintSnap = findConstraintSnap(pos);
    const cursorWorld = constraintSnap ?? snap ?? screenToWorld(pos.x, pos.y);
    //calculate intersection snap for preview
    const intersectionSnap = findIntersectionSnap(currentStart, cursorWorld);
    let preview = cursorWorld;

    //  Panning functionality
    if (panStart) {
      const dx = (pos.x - panStart.x) / scale;
      const dy = (pos.y - panStart.y) / scale;
      setOffsetX((ox) => ox + dx);
      setOffsetY((oy) => oy + dy);
      setPanStart({ x: pos.x, y: pos.y }); // Update pan start position
      redrawAll(previewEnd, snapPoint);
      return;
    }

    // Selection rectangle
    if (activeTool === 'SELECTION' && selectionStart) {
      const cursorWorld = screenToWorld(pos.x, pos.y);
      setSelectionEnd(cursorWorld);
      redrawAll(previewEnd, snapPoint);
      return;
    }

    // Check for vertex hover to toggle constraints
    if (snap) {
      const key = getVertexKey(snap);
      if (!hoveredVerticesRef.current.has(key)) {
        hoveredVerticesRef.current.add(key);
        toggleVertexConstraint(snap);
      }
    } else {
      hoveredVerticesRef.current.clear();
    }
    if (!currentStart) return;

    // Soft and Hard snapping logic
    if (currentStart) {
      const nearest = nearestOrthoAngleDeg(currentStart, cursorWorld);
      
      if (shiftHeld) {
        // Hard snapping override with Shift key
        const dx = cursorWorld.x - currentStart.x;
        const dy = cursorWorld.y - currentStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const rad = (nearest.angle * Math.PI) / 180;
        preview = { x: currentStart.x + Math.cos(rad) * dist, y: currentStart.y + Math.sin(rad) * dist };
      } else if (shouldUseOrthoSnapping()) {
        const constrained = applyOrthoConstraint(currentStart, cursorWorld);
        if (constrained) preview = { x: constrained.x, y: constrained.y };
      }
      
      // prioritize intersection snap for preview
      if (intersectionSnap) {
        preview = intersectionSnap;
      }
    }

    // Render ortho guidelines
    if (rendererRef.current) {
      const r = (rendererRef.current as unknown as any);
      r.setOrthoColor(orthoConfig.color.r, orthoConfig.color.g, orthoConfig.color.b, orthoConfig.color.a);
      r.setOrthoDash(orthoConfig.dashPx, orthoConfig.gapPx);
      r.setOrthoThickness(orthoConfig.thicknessPx);
      r.setOrthoThresholdDeg(orthoConfig.thresholdDeg);
      r.setOrthoAngles(new Float32Array(orthoConfig.anglesDeg));
    }

    setPreviewEnd(preview);
    redrawAll(preview, snap);
  };
  const handleMouseUp = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    if (evt.button === 1) {
      setPanStart(null);
    }
  };
  const handleKeyDown = (evt: React.KeyboardEvent) => {
    if (evt.key === "Escape") {
      resetTool();
      setActiveTool('SELECTION');
    }
  };
  const handleContextMenu = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    evt.preventDefault();
    resetTool();
  };
  const handleClear = () => {
    setLines([]);
    setVertexConstraints([]);
    resetTool();
    rendererRef.current?.clear();
  };
  const handleToolChange = (tool: ToolType) => {
    // Handle tool change
    setActiveTool(tool);
    resetTool(); // Reset any drawing state
  };
  const resetTool = () => {
    setCurrentStart(null);
    setPreviewEnd(null);
    setSnapPoint(null);
    setActiveConstraint(null);
    setVertexConstraints([]);
    setSelectionStart(null);
    setSelectionEnd(null);
    hoveredVerticesRef.current.clear();

    // Reset temporary ortho disable state when exiting line mode
    if (orthoTempDisabled) {
      setOrthoTempDisabled(false);
    }
    redrawAll(null, null);
  };


  // UI typescript
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
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        tabIndex={0}
      />
      <UIOverlay
        scale={scale}
        debug={debug}
        setDebug={setDebug}
        handleClear={handleClear}
        orthoSnapEnabled={orthoSnapEnabled}
        setOrthoSnapEnabled={setOrthoSnapEnabled}
        shiftHeld={shiftHeld}
        orthoTempDisabled={orthoTempDisabled}
        activeTool={activeTool}
        handleToolChange={handleToolChange}
      />
    </div>
  );
};

export default App;
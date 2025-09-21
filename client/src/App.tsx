import React, { useEffect, useRef, useState } from "react";
import init, { Renderer } from "./pkg/draftr_engine.js";
import UIOverlay from "./UIOverlay";

const SNAP_THRESHOLD = 25; // px
const SNAP_INDICATOR_RADIUS = 5; // px

// Default orthogonal config (you can update at runtime via renderer methods)
const DEFAULT_ORTHO_COLOR = { r: 0, g: 255, b: 0, a: 1.0 };
const DEFAULT_ORTHO_DASH_PX = 8;
const DEFAULT_ORTHO_GAP_PX = 6;
const DEFAULT_ORTHO_THICKNESS_PX = 1;
const DEFAULT_ORTHO_THRESHOLD_DEG = 5;

const ORTHO_ANGLES_DEG = [0, 45, 90, 135]; // default set (exposed to wasm to be changed at runtime)

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);

  const [lines, setLines] = useState<number[][]>([]);
  const [currentStart, setCurrentStart] = useState<{ x: number; y: number } | null>(null);
  const [previewEnd, setPreviewEnd] = useState<{ x: number; y: number } | null>(null);
  const [snapConfig] = useState({ enabled: true });

  // Pan/zoom state
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);

  // UI / Debug
  const [debug, setDebug] = useState(false);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({
    w: typeof window !== "undefined" ? window.innerWidth : 650,
    h: typeof window !== "undefined" ? window.innerHeight : 650,
  });

  // persistent snap point
  const [snapPoint, setSnapPoint] = useState<{ x: number; y: number } | null>(null);

  // Shift-key orthogonal mode
  const [shiftHeld, setShiftHeld] = useState(false);

  // Orthogonal snapping toggle state
  const [orthoSnapEnabled, setOrthoSnapEnabled] = useState(true);
  
  // Track if we're temporarily disabling ortho snapping due to vertex priority
  const [orthoTempDisabled, setOrthoTempDisabled] = useState(false);
  // Store previous ortho state for restoration after vertex snap
  const orthoPrevStateRef = useRef<boolean>(true);

  // runtime orthogonal configuration (kept in React to possibly render UI later)
  const [orthoConfig, setOrthoConfig] = useState({
    color: DEFAULT_ORTHO_COLOR,
    dashPx: DEFAULT_ORTHO_DASH_PX,
    gapPx: DEFAULT_ORTHO_GAP_PX,
    thicknessPx: DEFAULT_ORTHO_THICKNESS_PX,
    thresholdDeg: DEFAULT_ORTHO_THRESHOLD_DEG,
    anglesDeg: ORTHO_ANGLES_DEG,
  });

  // track last guide active state so we can only console.log on changes
  const guideActiveRef = useRef<boolean>(false);

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

        // Configure orthogonal defaults at runtime
        const r = (rendererRef.current as unknown as any);
        if (r) {
          r.setOrthoColor(orthoConfig.color.r, orthoConfig.color.g, orthoConfig.color.b, orthoConfig.color.a);
          r.setOrthoDash(orthoConfig.dashPx, orthoConfig.gapPx);
          r.setOrthoThickness(orthoConfig.thicknessPx);
          r.setOrthoThresholdDeg(orthoConfig.thresholdDeg);
          r.setOrthoAngles(new Float32Array(orthoConfig.anglesDeg));
        }

        renderer.clear();
        renderer.resize(canvasSize.w, canvasSize.h);
        renderer.draw_grid(offsetX, offsetY, scale);
      }
    };
    run();
  }, []); // run once

  // keep renderer's viewport in sync on resize
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
  }, [previewEnd, lines, scale, offsetX, offsetY, snapPoint]);

  // keyboard listeners for Shift and F8
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

  // snapping logic
  const findSnap = (pos: { x: number; y: number }) => {
    if (!snapConfig.enabled) {
      setSnapPoint(null);
      return null;
    }

    let closest: { x: number; y: number } | null = null;
    let minDist = SNAP_THRESHOLD;

    // vertex snapping
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

    // Vertex Snap Priority: If we found a vertex snap, temporarily disable orthogonal snapping
    if (closest) {
      setSnapPoint(closest);
      
      // Only disable ortho if it was enabled and we're not already in temp disabled state
      if (orthoSnapEnabled && !orthoTempDisabled) {
        orthoPrevStateRef.current = orthoSnapEnabled;
        setOrthoTempDisabled(true);
        logDebug("Vertex snap found, temporarily disabling ortho snapping");
      }
      
      logDebug("snap to vertex", closest);
      return closest; // Exit early if vertex snap is found
    } else {
      // No vertex snap found, restore ortho snapping if it was temporarily disabled
      if (orthoTempDisabled) {
        setOrthoTempDisabled(false);
        // Only restore if it was previously enabled (not manually toggled off)
        if (orthoPrevStateRef.current) {
          logDebug("No vertex snap, restoring ortho snapping");
        }
      }
      // Clear snap point when no vertex is within threshold
      setSnapPoint(null);
    }

    // Orthogonal Snapping (only if no vertex snap)
    return null;
  };

  // orthogonal helpers
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

  // Check if orthogonal snapping should be active (considering all conditions)
  const shouldUseOrthoSnapping = () => {
    // Hard override with Shift key (temporary orthogonal snapping)
    if (shiftHeld) return true;
    
    // Normal orthogonal snapping (if enabled and not temporarily disabled due to vertex priority)
    return orthoSnapEnabled && !orthoTempDisabled;
  };

  // redraw logic
  const redrawAll = (preview: { x: number; y: number } | null, snap: { x: number; y: number } | null) => {
    if (!rendererRef.current || !canvasRef.current) return;
    const renderer = rendererRef.current;
    renderer.offset_x = offsetX;
    renderer.offset_y = offsetY;
    renderer.scale = scale;

    renderer.clear();
    renderer.draw_grid(offsetX, offsetY, scale);

    // draw orthogonal guides first to keep it always at the bottom 
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

    for (const line of lines) {
      renderer.draw_line(line[0], line[1], line[2], line[3], line[4], line[5], line[6], 1.0);
    }

    if (currentStart && preview) {
      renderer.draw_line(currentStart.x, currentStart.y, preview.x, preview.y, 0, 0, 0, 1.0);
    }

    const snapToDraw = snap ?? snapPoint;
    if (snapToDraw) {
      renderer.draw_circle(snapToDraw.x, snapToDraw.y, SNAP_INDICATOR_RADIUS, 1, 0, 0, 1.0, 16, true);
    }
  };

  // mouse handlers
  const handleMouseDown = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(evt);
    if (evt.button === 0) {
      const snap = findSnap(pos);
      let finalPos = snap ?? screenToWorld(pos.x, pos.y);

      // Endpoint is constrained to lie along the guideline
      if (shiftHeld && previewEnd) {
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
      }
    } else if (evt.button === 1) {
      panStartRef.current = { x: pos.x, y: pos.y };
    }
  };

  const handleMouseMove = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(evt);

    if (panStartRef.current) {
      const dx = (pos.x - panStartRef.current.x) / scale;
      const dy = (pos.y - panStartRef.current.y) / scale;
      setOffsetX((ox) => ox + dx);
      setOffsetY((oy) => oy + dy);
      panStartRef.current = { x: pos.x, y: pos.y };
      redrawAll(previewEnd, snapPoint);
      return;
    }

    if (!currentStart) return;
    
    const snap = findSnap(pos);

    const cursorWorld = snap ?? screenToWorld(pos.x, pos.y);
    const nearest = nearestOrthoAngleDeg(currentStart, cursorWorld);

    let preview = cursorWorld;
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

    setPreviewEnd(preview);

    if (rendererRef.current) {
      const r = (rendererRef.current as unknown as any);
      r.setOrthoColor(orthoConfig.color.r, orthoConfig.color.g, orthoConfig.color.b, orthoConfig.color.a);
      r.setOrthoDash(orthoConfig.dashPx, orthoConfig.gapPx);
      r.setOrthoThickness(orthoConfig.thicknessPx);
      r.setOrthoThresholdDeg(orthoConfig.thresholdDeg);
      r.setOrthoAngles(new Float32Array(orthoConfig.anglesDeg));
    }

    redrawAll(preview, snap);
  };

  const handleMouseUp = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    if (evt.button === 1) panStartRef.current = null;
  };

  const exitLineMode = () => {
    setCurrentStart(null);
    setPreviewEnd(null);
    setSnapPoint(null);
    // Reset temporary ortho disable state when exiting line mode
    if (orthoTempDisabled) {
      setOrthoTempDisabled(false);
    }
    redrawAll(null, null);
  };

  const handleKeyDown = (evt: React.KeyboardEvent) => {
    if (evt.key === "Escape") {
      exitLineMode();
    }
  };

  const handleContextMenu = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    evt.preventDefault();
    exitLineMode();
  };

  const handleClear = () => {
    setLines([]);
    exitLineMode();
    rendererRef.current?.clear();
  };

  // zoom
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
      const newScale = oldScale * (1 + delta);

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

  useEffect(() => {
    redrawAll(previewEnd, snapPoint);
  }, [lines, scale, offsetX, offsetY, previewEnd, snapPoint, orthoConfig, shiftHeld, orthoSnapEnabled, orthoTempDisabled]);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        style={{ border: "none", display: "block", width: "100vw", height: "100vh", cursor: panStartRef.current ? "grabbing" : "crosshair" }}
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
      />
    </div>
  );
};

export default App;
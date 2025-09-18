import React, { useEffect, useRef, useState } from "react";
import init, { Renderer } from "./pkg/draftr_engine.js";
import UIOverlay from "./UIOverlay";

const SNAP_THRESHOLD = 20; // px
const SNAP_INDICATOR_RADIUS = 6; // px

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

  // grid opacity configurable; default 0.25
  const [gridOpacity, setGridOpacity] = useState(0.25);

  // persisted snap point to avoid flicker while mouse is idle
  const [snapPoint, setSnapPoint] = useState<{ x: number; y: number } | null>(null);


  useEffect(() => {
    const run = async () => {
      await init();
      if (canvasRef.current) {
        const renderer = new Renderer(canvasRef.current);
        rendererRef.current = renderer;

        // Set initial transform values
        (renderer as any).offset_x = offsetX;
        (renderer as any).offset_y = offsetY;
        (renderer as any).scale = scale;

        renderer.clear();
        // ensure renderer viewport matches current canvas size
        renderer.resize(canvasSize.w, canvasSize.h);

        // Draw initial grid
        renderer.draw_grid(offsetX, offsetY, scale, gridOpacity);
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
        // We changed size; redraw
        redrawAll(previewEnd, snapPoint);
      }
    };
    window.addEventListener("resize", handleResize);
    // set initial values
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [previewEnd, lines, scale, offsetX, offsetY, snapPoint, gridOpacity]);

  // Utility logging behind debug flag
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

  // find snap but also persists result in snapPoint state
  const findSnap = (pos: { x: number; y: number }) => {
    if (!snapConfig.enabled) {
      setSnapPoint(null);
      return null;
    }

    let closest: { x: number; y: number } | null = null;
    let minDist = SNAP_THRESHOLD;

    // Iterate over all lines except the last one
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

    // Handle the first point of the last line, if it exists
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

    if (closest) {
      setSnapPoint(closest);
      logDebug("snap to", closest);
    } else {
      setSnapPoint(null); // ← This is the key fix
    }
    return closest;
  };

  // redrawAll now sets renderer transform then draws grid then lines and preview/snap
  const redrawAll = (preview: { x: number; y: number } | null, snap: { x: number; y: number } | null) => {
    if (!rendererRef.current || !canvasRef.current) return;
    const renderer = rendererRef.current;
    // update renderer transform fields (these are exposed by wasm_bindgen since the Rust fields are `pub`)
    (renderer as any).offset_x = offsetX;
    (renderer as any).offset_y = offsetY;
    (renderer as any).scale = scale;

    renderer.clear();

    // Draw grid first (adaptive) — pass gridOpacity
    renderer.draw_grid(offsetX, offsetY, scale, gridOpacity);

    // Draw committed lines (lines stored in world coords)
    for (const line of lines) {
      // lines array: [x1,y1,x2,y2,r,g,b] previously — update: supply alpha=1
      renderer.draw_line(line[0], line[1], line[2], line[3], line[4], line[5], line[6], 1.0);
    }

    // Preview line (world coords)
    if (currentStart && preview) {
      renderer.draw_line(currentStart.x, currentStart.y, preview.x, preview.y, 0, 0, 0, 1.0);
    }

    // Snap indicator: use persisted snapPoint if provided or fallback to snap argument
    const snapToDraw = snap ?? snapPoint;
    if (snapToDraw) {
      // draw circle in world coords, radius in screen pixels, with alpha 1.0
      renderer.draw_circle(snapToDraw.x, snapToDraw.y, SNAP_INDICATOR_RADIUS, 1, 0, 0, 1.0, 16, true);
    }
  };

  // Mouse events
  const handleMouseDown = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(evt);
    if (evt.button === 0) {
      const snap = findSnap(pos);
      const finalPos = snap ?? screenToWorld(pos.x, pos.y);

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

    // Panning
    if (panStartRef.current) {
      const dx = (pos.x - panStartRef.current.x) / scale;
      const dy = (pos.y - panStartRef.current.y) / scale;
      setOffsetX((ox) => {
        const nx = ox + dx;
        logDebug("pan offsetX ->", nx);
        return nx;
      });
      setOffsetY((oy) => {
        const ny = oy + dy;
        logDebug("pan offsetY ->", ny);
        return ny;
      });
      panStartRef.current = { x: pos.x, y: pos.y };
      // redraw with updated offset (we call redrawAll directly because setState won't be synchronous)
      const newOffsetX = offsetX + dx;
      const newOffsetY = offsetY + dy;
      if (rendererRef.current) {
        (rendererRef.current as any).offset_x = newOffsetX;
        (rendererRef.current as any).offset_y = newOffsetY;
        (rendererRef.current as any).scale = scale;
        rendererRef.current.clear();
        rendererRef.current.draw_grid(newOffsetX, newOffsetY, scale, gridOpacity);
        for (const line of lines) {
          rendererRef.current.draw_line(line[0], line[1], line[2], line[3], line[4], line[5], line[6], 1.0);
        }
      }
      return;
    }

    // Line preview & snap
    if (!currentStart) return;
    const snap = findSnap(pos); // findSnap will set snapPoint if found
    const preview = snap ?? screenToWorld(pos.x, pos.y);
    setPreviewEnd(preview);
    // redraw and prefer the explicit snap (the findSnap persistently set snapPoint)
    redrawAll(preview, snap);
  };

  const handleMouseUp = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    if (evt.button === 1) panStartRef.current = null;
  };

  const exitLineMode = () => {
    setCurrentStart(null);
    setPreviewEnd(null);
    // clear persisted snap point as requested
    setSnapPoint(null);
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

  // Attach non-passive wheel listener for zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (evt: WheelEvent) => {
      evt.preventDefault();
      const pos = getMousePos(evt); // screen coords

      const oldScale = scale;
      const oldOffsetX = offsetX;
      const oldOffsetY = offsetY;

      const worldBeforeX = pos.x / oldScale - oldOffsetX;
      const worldBeforeY = pos.y / oldScale - oldOffsetY;

      const delta = -evt.deltaY * 0.001;
      const newScale = oldScale * (1 + delta);

      const newOffsetX = pos.x / newScale - worldBeforeX;
      const newOffsetY = pos.y / newScale - worldBeforeY;

      // update state
      setScale(newScale);
      setOffsetX(newOffsetX);
      setOffsetY(newOffsetY);

      logDebug("zoom ->", Math.round(newScale * 100) + "%", "offset", newOffsetX, newOffsetY);

      // immediate redraw using the new transform values
      if (rendererRef.current) {
        (rendererRef.current as any).offset_x = newOffsetX;
        (rendererRef.current as any).offset_y = newOffsetY;
        (rendererRef.current as any).scale = newScale;

        rendererRef.current.clear();
        rendererRef.current.draw_grid(newOffsetX, newOffsetY, newScale, gridOpacity);

        for (const line of lines) {
          rendererRef.current.draw_line(line[0], line[1], line[2], line[3], line[4], line[5], line[6], 1.0);
        }

        // preview + snap drawing (if any)
        if (currentStart && previewEnd) {
          rendererRef.current.draw_line(currentStart.x, currentStart.y, previewEnd.x, previewEnd.y, 0, 0, 0, 1.0);
        }

        // persist snap remains drawn via snapPoint
        if (snapPoint) {
          rendererRef.current.draw_circle(snapPoint.x, snapPoint.y, SNAP_INDICATOR_RADIUS, 1, 0, 0, 1.0, 16, true);
        }
      }
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [scale, offsetX, offsetY, previewEnd, lines, currentStart, debug, gridOpacity, snapPoint]);

  // Redraw when lines or transform change
  useEffect(() => {
    redrawAll(previewEnd, snapPoint);
  }, [lines, scale, offsetX, offsetY, previewEnd, snapPoint, gridOpacity]);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      {/* Drawing Canvas */}
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
      
      {/* Floating UI overlay */}
      <UIOverlay
        scale={scale}
        debug={debug}
        setDebug={setDebug}
        handleClear={handleClear}
      />
    </div>
  );
};

export default App;
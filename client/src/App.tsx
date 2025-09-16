import React, { useEffect, useRef, useState } from "react";
import init, { Renderer } from "./pkg/draftr_engine.js"; // wasm pkg

const SNAP_THRESHOLD = 20; // px
const SNAP_INDICATOR_RADIUS = 6; // px

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);

  const [lines, setLines] = useState<number[][]>([]);
  const [currentStart, setCurrentStart] = useState<{ x: number; y: number } | null>(null);
  const [previewEnd, setPreviewEnd] = useState<{ x: number; y: number } | null>(null);
  const [snapConfig] = useState({ enabled: true });

  // pan/zoom state
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const run = async () => {
      await init();
      if (canvasRef.current) {
        const renderer = new Renderer(canvasRef.current);
        rendererRef.current = renderer;
        renderer.clear();
      }
    };
    run();
  }, []);

  const screenToWorld = (x: number, y: number) => ({
    x: x / scale - offsetX,
    y: y / scale - offsetY,
  });

  const worldToScreen = (x: number, y: number) => ({
    x: (x + offsetX) * scale,
    y: (y + offsetY) * scale,
  });

  const getMousePos = (evt: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  };

  const findSnap = (pos: { x: number; y: number }) => {
    if (!snapConfig.enabled) return null;
    let closest: { x: number; y: number } | null = null;
    let minDist = SNAP_THRESHOLD;

    for (const line of lines) {
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
          closest = pt; // store in world-space
        }
      }
    }
    return closest;
  };

  const redrawAll = (preview: { x: number; y: number } | null, snap: { x: number; y: number } | null) => {
    if (!rendererRef.current) return;
    const renderer = rendererRef.current;
    renderer.clear();

    // draw committed lines
    for (const line of lines) {
      const p1 = worldToScreen(line[0], line[1]);
      const p2 = worldToScreen(line[2], line[3]);
      renderer.draw_line(p1.x, p1.y, p2.x, p2.y, line[4], line[5], line[6]);
    }

    // preview line
    if (currentStart && preview) {
      const p1 = worldToScreen(currentStart.x, currentStart.y);
      const p2 = worldToScreen(preview.x, preview.y);
      renderer.draw_line(p1.x, p1.y, p2.x, p2.y, 0, 0, 0);
    }

    // snap indicator
    if (snap) {
      const screenSnap = worldToScreen(snap.x, snap.y);
      renderer.draw_circle(screenSnap.x, screenSnap.y, SNAP_INDICATOR_RADIUS, 1, 0, 0, 16);
    }
  };

  // Line drawing
  const handleMouseDown = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(evt);

    if (evt.button === 0) {
      const snap = findSnap(pos);
      const finalPos = snap ?? screenToWorld(pos.x, pos.y);

      if (!currentStart) setCurrentStart(finalPos);
      else {
        setLines((prev) => [...prev, [currentStart.x, currentStart.y, finalPos.x, finalPos.y, 0, 0, 0]]);
        setCurrentStart(finalPos);
        setPreviewEnd(null);
      }
    } else if (evt.button === 1) {
      // start panning
      panStartRef.current = { x: pos.x, y: pos.y };
      evt.preventDefault();
    }
  };

  const handleMouseMove = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(evt);

    // panning
    if (panStartRef.current) {
      const dx = (pos.x - panStartRef.current.x) / scale;
      const dy = (pos.y - panStartRef.current.y) / scale;
      setOffsetX((ox) => ox + dx);
      setOffsetY((oy) => oy + dy);
      panStartRef.current = { x: pos.x, y: pos.y };
      redrawAll(previewEnd, null);
      return;
    }

    if (!currentStart) return;
    const snap = findSnap(pos);
    const preview = snap ?? screenToWorld(pos.x, pos.y);
    setPreviewEnd(preview);
    redrawAll(preview, snap);
  };

  const handleMouseUp = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    if (evt.button === 1) panStartRef.current = null;
  };

  const handleWheel = (evt: React.WheelEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(evt);
    const worldPosBefore = screenToWorld(pos.x, pos.y);
    const delta = -evt.deltaY * 0.001;
    const newScale = scale * (1 + delta);
    setScale(newScale);

    // adjust offset so zoom centers on cursor
    const worldPosAfter = screenToWorld(pos.x, pos.y);
    setOffsetX((ox) => ox + (worldPosBefore.x - worldPosAfter.x));
    setOffsetY((oy) => oy + (worldPosBefore.y - worldPosAfter.y));

    redrawAll(previewEnd, findSnap(pos));
  };

  const exitLineMode = () => {
    setCurrentStart(null);
    setPreviewEnd(null);
    redrawAll(null, null);
  };

  const handleKeyDown = (evt: React.KeyboardEvent) => {
    if (evt.key === "Escape") exitLineMode();
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

  useEffect(() => {
    redrawAll(previewEnd, null);
  }, [lines]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={650}
        height={650}
        style={{ border: "none", cursor: panStartRef.current ? "grabbing" : "crosshair" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        tabIndex={0}
      />
      <br />
      <button onClick={handleClear}>Clear</button>
    </div>
  );
};

export default App;

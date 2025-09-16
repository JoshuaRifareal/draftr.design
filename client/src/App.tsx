import React, { useEffect, useRef, useState } from "react";
import init, { Renderer } from "./pkg/draftr_engine.js"; // wasm pkg

const SNAP_THRESHOLD = 20; // px distance
const SNAP_INDICATOR_RADIUS = 6; // px radius of filled circle

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);

  const [lines, setLines] = useState<number[][]>([]);
  const [currentStart, setCurrentStart] = useState<{ x: number; y: number } | null>(null);
  const [previewEnd, setPreviewEnd] = useState<{ x: number; y: number } | null>(null);
  const [snapConfig] = useState({ enabled: true });

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

  const getMousePos = (evt: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  };

  const findSnap = (pos: { x: number; y: number }) => {
    if (!snapConfig.enabled) return null;
    let closest: { x: number; y: number } | null = null;
    let minDist = SNAP_THRESHOLD;
    for (const line of lines) {
      const pts = [{ x: line[0], y: line[1] }, { x: line[2], y: line[3] }];
      for (const pt of pts) {
        const dx = pt.x - pos.x;
        const dy = pt.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          closest = pt;
        }
      }
    }
    return closest;
  };

  const redrawAll = (preview: { x: number; y: number } | null, snap: { x: number; y: number } | null) => {
    if (!rendererRef.current) return;
    const renderer = rendererRef.current;

    renderer.clear();
    for (const line of lines) {
      renderer.draw_line(line[0], line[1], line[2], line[3], line[4], line[5], line[6]);
    }

    if (currentStart && preview) {
      renderer.draw_line(currentStart.x, currentStart.y, preview.x, preview.y, 0.0, 0.0, 0.0);
    }

    // Draw filled circle snap indicator
    if (snap) {
      renderer.draw_circle(snap.x, snap.y, SNAP_INDICATOR_RADIUS, 1.0, 0.0, 0.0, 16);
    }
  };

  const handleMouseDown = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    if (evt.button !== 0) return;
    const pos = getMousePos(evt);
    const snap = findSnap(pos);
    const finalPos = snap ?? pos;

    if (!currentStart) setCurrentStart(finalPos);
    else {
      setLines((prev) => [...prev, [currentStart.x, currentStart.y, finalPos.x, finalPos.y, 0.0, 0.0, 0.0]]);
      setCurrentStart(finalPos);
      setPreviewEnd(null);
    }
  };

  const handleMouseMove = (evt: React.MouseEvent) => {
    if (!currentStart) return;
    const pos = getMousePos(evt);
    const snap = findSnap(pos);
    const preview = snap ?? pos;
    setPreviewEnd(preview);
    redrawAll(preview, snap);
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
        style={{ border: "none", cursor: "crosshair" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
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

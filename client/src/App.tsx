import React, { useEffect, useRef, useState } from "react";
import init, { Renderer } from "./pkg/draftr_engine.js"; // wasm pkg

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);

  // Store committed lines: each is [x1, y1, x2, y2, r, g, b]
  const [lines, setLines] = useState<number[][]>([]);
  // Track current line workflow
  const [currentStart, setCurrentStart] = useState<{ x: number; y: number } | null>(null);
  const [previewEnd, setPreviewEnd] = useState<{ x: number; y: number } | null>(null);

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
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
    };
  };

  const redrawAll = (preview: { x: number; y: number } | null) => {
    if (!rendererRef.current) return;
    const renderer = rendererRef.current;

    // clear first
    renderer.clear();

    // draw committed lines
    for (const line of lines) {
      renderer.draw_line(line[0], line[1], line[2], line[3], line[4], line[5], line[6]);
    }

    // draw preview line if exists
    if (currentStart && preview) {
      renderer.draw_line(currentStart.x, currentStart.y, preview.x, preview.y, 0.0, 0.0, 0.0);
    }
  };

  // only react to left mouse button (button === 0)
  const handleMouseDown = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    if (evt.button !== 0) return; // ignore right/middle clicks here

    const pos = getMousePos(evt);

    if (!currentStart) {
      // first click → set start point
      setCurrentStart(pos);
    } else {
      // second click → finalize line
      const newLine = [currentStart.x, currentStart.y, pos.x, pos.y, 0.0, 0.0, 0.0];
      setLines((prev) => [...prev, newLine]);
      setCurrentStart(pos); // prepare for next line
      setPreviewEnd(null);
    }
  };

  const handleMouseMove = (evt: React.MouseEvent) => {
    if (!currentStart) return; // only preview if we have a start point
    const pos = getMousePos(evt);
    setPreviewEnd(pos);
    redrawAll(pos);
  };

  const exitLineMode = () => {
    setCurrentStart(null);
    setPreviewEnd(null);
    redrawAll(null);
  };

  const handleKeyDown = (evt: React.KeyboardEvent) => {
    if (evt.key === "Escape") {
      exitLineMode();
    }
  };

  // Right-click: cancel like ESC. Prevent default menu, clear preview immediately by using the renderer directly.
  const handleContextMenu = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    evt.preventDefault(); // stop browser right-click menu

    // clear the in-progress state
    setCurrentStart(null);
    setPreviewEnd(null);

    // Immediately clear & redraw committed lines via renderer to avoid race with state updates
    if (rendererRef.current) {
      const renderer = rendererRef.current;
      renderer.clear();
      for (const line of lines) {
        renderer.draw_line(line[0], line[1], line[2], line[3], line[4], line[5], line[6]);
      }
    }
  };

  const handleClear = () => {
    setLines([]);
    setCurrentStart(null);
    setPreviewEnd(null);
    rendererRef.current?.clear();
  };

  // redraw when committed lines change
  useEffect(() => {
    redrawAll(previewEnd);
  }, [lines]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={650}
        height={650}
        style={{ border: "1px solid black", cursor: "crosshair" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        tabIndex={0} // so canvas can receive key events
      />
      <br />
      <button onClick={handleClear}>Clear</button>
    </div>
  );
};

export default App;

// client/src/App.tsx
import React, { useEffect, useRef } from "react";
import init, { draw_line } from "./pkg/draftr_engine";

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCount = useRef<number>(0); // debug counter

  useEffect(() => {
    const boot = async () => {
      try {
        await init();
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("Canvas not found");

        const gl = canvas.getContext("webgl");
        if (!gl) throw new Error("WebGL not supported");

        // Shaders
        const vsSource = `
          attribute vec2 aPos;
          uniform vec2 uRes;
          void main() {
            vec2 zeroToOne = aPos / uRes;
            vec2 zeroToTwo = zeroToOne * 2.0;
            vec2 clipSpace = zeroToTwo - 1.0;
            gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
          }
        `;

        const fsSource = `
          precision mediump float;
          uniform vec4 uColor;
          void main() {
            gl_FragColor = uColor;
          }
        `;

        // Compile shader helper
        const compile = (type: number, source: string) => {
          const shader = gl.createShader(type)!;
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed");
          }
          return shader;
        };

        const vs = compile(gl.VERTEX_SHADER, vsSource);
        const fs = compile(gl.FRAGMENT_SHADER, fsSource);

        const program = gl.createProgram()!;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program) || "Program link failed");
        }
        gl.useProgram(program);

        // Look up locations
        const aPos = gl.getAttribLocation(program, "aPos");
        const uColor = gl.getUniformLocation(program, "uColor");
        const uRes = gl.getUniformLocation(program, "uRes"); // ✅ FIXED

        if (!uColor || !uRes) throw new Error("Uniforms not found");

        // Set resolution uniform once
        gl.uniform2f(uRes, canvas.width, canvas.height);

        // Buffer setup
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        // Call Rust fn to get line points
        const line = draw_line(50.0, 50.0, 350.0, 350.0);
        console.log("draw_line returned:", line);

        // Debug counter
        drawCount.current += 1;
        console.log("Lines drawn:", drawCount.current);

        // Send data to GPU
        gl.bufferData(gl.ARRAY_BUFFER, line, gl.STATIC_DRAW);

        // Set color red
        gl.uniform4f(uColor, 1.0, 0.0, 0.0, 1.0);

        // Draw
        gl.drawArrays(gl.LINES, 0, 2);
      } catch (err) {
        console.error("boot error:", err);
      }
    };

    boot();
  }, []);

  return <canvas ref={canvasRef} width={800} height={600} />;
};

export default App;

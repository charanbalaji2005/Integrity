import React, { useEffect, useRef, useState } from "react";

/**
 * IntegrityGlobe — a dependency-free WebGL point-cloud globe with a sweeping
 * "scan" band and orbit rings. Purely decorative (aria-hidden).
 *
 * Performance / accessibility:
 *  - pauses when off-screen (IntersectionObserver) or when the tab is hidden
 *  - device-pixel-ratio capped at 2
 *  - prefers-reduced-motion → renders a single still frame
 *  - no WebGL → renders `fallback` (or nothing)
 */

type RGB = [number, number, number];

export interface IntegrityGlobeProps {
  className?: string;
  /** Main point colour. */
  base?: RGB;
  /** Colour of the scan band / ring highlights. */
  accent?: RGB;
  /** Overall opacity multiplier (0–1). */
  intensity?: number;
  /** Number of points on the sphere. */
  points?: number;
  /** Point size in CSS px (before perspective). */
  pointSize?: number;
  /** Follow the pointer with a gentle tilt. */
  interactive?: boolean;
  fallback?: React.ReactNode;
}

const hex = (h: string): RGB => {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const globeColor = hex;

const VERT = `
attribute vec3 aPos;
attribute float aSeed;
attribute float aKind;           // 0 = sphere, 1 = ring
uniform float uTime;
uniform vec2  uTilt;
uniform float uAspect;
uniform float uSize;
uniform float uDpr;
varying float vDepth;
varying float vScan;
varying float vKind;
varying float vTwinkle;

mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }

void main(){
  vec3 p = aPos;
  // gentle breathing on the sphere surface
  if (aKind < 0.5) p *= 1.0 + 0.018 * sin(uTime * 1.6 + aSeed * 6.2831);
  p = rotX(0.38 + uTilt.y) * rotY(uTime * 0.12 + uTilt.x) * p;

  float z = p.z + 2.9;
  float scale = 2.25;
  gl_Position = vec4(p.x * scale / z / uAspect, p.y * scale / z, 0.0, 1.0);

  // latitude scan band sweeping up and down
  float band = sin(uTime * 0.55) * 0.95;
  vScan = smoothstep(0.16, 0.0, abs(p.y - band));
  vDepth = clamp((1.15 - p.z) / 2.3, 0.0, 1.0);   // 1 = front, 0 = back
  vKind = aKind;
  vTwinkle = 0.65 + 0.35 * sin(uTime * 2.3 + aSeed * 40.0);

  float sz = uSize * (aKind > 0.5 ? 0.75 : 1.0) * (1.0 + vScan * 1.4);
  gl_PointSize = sz * uDpr * (3.0 / z);
}`;

const FRAG = `
precision mediump float;
uniform vec3  uBase;
uniform vec3  uAccent;
uniform float uIntensity;
varying float vDepth;
varying float vScan;
varying float vKind;
varying float vTwinkle;

void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.05, d);
  vec3 col = mix(uBase, uAccent, clamp(vScan + vKind * 0.55, 0.0, 1.0));
  float a = soft * mix(0.12, 1.0, vDepth) * (vKind > 0.5 ? 0.55 : vTwinkle);
  a = min(1.0, a + vScan * 0.6 * vDepth);
  a *= uIntensity;
  gl_FragColor = vec4(col * a, a);   // premultiplied alpha
}`;

function buildGeometry(count: number) {
  const ringPerLoop = 220;
  const rings = 3;
  const total = count + ringPerLoop * rings;
  const pos = new Float32Array(total * 3);
  const seed = new Float32Array(total);
  const kind = new Float32Array(total);

  // Fibonacci sphere — evenly distributed points
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const t = golden * i;
    pos.set([Math.cos(t) * r, y, Math.sin(t) * r], i * 3);
    seed[i] = Math.random();
  }

  // Tilted orbit rings slightly outside the sphere
  const tilts: [number, number, number][] = [
    [1.28, 0.0, 1.0],
    [1.38, 1.1, 0.35],
    [1.48, -0.9, -0.6],
  ];
  let k = count;
  for (const [radius, ax, az] of tilts) {
    for (let j = 0; j < ringPerLoop; j++, k++) {
      const a = (j / ringPerLoop) * Math.PI * 2;
      let x = Math.cos(a) * radius;
      let y = 0;
      let z = Math.sin(a) * radius;
      // rotate ring around X then Z
      const y1 = y * Math.cos(ax) - z * Math.sin(ax);
      const z1 = y * Math.sin(ax) + z * Math.cos(ax);
      const x2 = x * Math.cos(az) - y1 * Math.sin(az);
      const y2 = x * Math.sin(az) + y1 * Math.cos(az);
      x = x2;
      y = y2;
      z = z1;
      pos.set([x, y, z], k * 3);
      seed[k] = Math.random();
      kind[k] = 1;
    }
  }
  return { pos, seed, kind, total };
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) throw new Error("shader alloc failed");
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader compile failed");
  return s;
}

export function IntegrityGlobe({
  className,
  base = hex("#ffffff"),
  accent = hex("#34d399"),
  intensity = 1,
  points = 2200,
  pointSize = 2.4,
  interactive = true,
  fallback = null,
}: IntegrityGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) {
      setSupported(false);
      return;
    }

    let program: WebGLProgram;
    try {
      program = gl.createProgram() as WebGLProgram;
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "link failed");
    } catch (err) {
      console.warn("[IntegrityGlobe] WebGL unavailable:", err);
      setSupported(false);
      return;
    }
    gl.useProgram(program);

    const geo = buildGeometry(points);
    const bind = (name: string, data: Float32Array, size: number) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      return buf;
    };
    const buffers = [bind("aPos", geo.pos, 3), bind("aSeed", geo.seed, 1), bind("aKind", geo.kind, 1)];

    const u = (n: string) => gl.getUniformLocation(program, n);
    const uTime = u("uTime"), uTilt = u("uTilt"), uAspect = u("uAspect"), uSize = u("uSize"), uDpr = u("uDpr");
    gl.uniform3fv(u("uBase"), base);
    gl.uniform3fv(u("uAccent"), accent);
    gl.uniform1f(u("uIntensity"), intensity);
    gl.uniform1f(uSize, pointSize);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform1f(uAspect, w / h);
      gl.uniform1f(uDpr, dpr);
    };

    const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      tilt.tx = ((e.clientX - r.left) / r.width - 0.5) * 0.6;
      tilt.ty = ((e.clientY - r.top) / r.height - 0.5) * 0.35;
    };
    if (interactive && !reduce) window.addEventListener("pointermove", onPointer, { passive: true });

    let raf = 0;
    let visible = true;
    const t0 = performance.now();
    const draw = () => {
      resize();
      tilt.x += (tilt.tx - tilt.x) * 0.05;
      tilt.y += (tilt.ty - tilt.y) * 0.05;
      gl.uniform1f(uTime, reduce ? 4.2 : (performance.now() - t0) / 1000);
      gl.uniform2f(uTilt, tilt.x, tilt.y);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, geo.total);
    };
    const loop = () => {
      draw();
      raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const start = () => {
      if (!raf && !reduce) raf = requestAnimationFrame(loop);
    };

    draw();
    start();

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    io.observe(canvas);
    const onVis = () => !document.hidden && visible && start();
    document.addEventListener("visibilitychange", onVis);
    const ro = new ResizeObserver(() => reduce && draw());
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onPointer);
      buffers.forEach((b) => gl.deleteBuffer(b));
      gl.deleteProgram(program);
    };
    // Colours are fixed per mount; re-running on array identity would rebuild the GL context needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, pointSize, intensity, interactive]);

  if (!supported) return <>{fallback}</>;
  return <canvas ref={canvasRef} aria-hidden="true" className={className} style={{ display: "block", width: "100%", height: "100%" }} />;
}

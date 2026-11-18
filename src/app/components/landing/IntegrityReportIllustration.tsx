import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Isometric hero illustration: a laptop printing an integrity report that
 * rolls out across the floor, rising analytics bars, a magnifying glass for
 * evidence review and a faculty reviewer. Hand-built SVG (no raster assets).
 */

const U = 30; // px per isometric unit
const OX = 430;
const OY = 276;
const COS = 0.866;

type P3 = [number, number, number];

const iso = (x: number, y: number, z = 0): [number, number] => [
  OX + (x - y) * COS * U,
  OY + (x + y) * 0.5 * U - z * U,
];
const pts = (list: P3[]) =>
  list.map(([x, y, z]) => iso(x, y, z).map((n) => n.toFixed(1)).join(",")).join(" ");

/* ───────── primitives ───────── */

const EASE_SPLINES = "0.42 0 0.58 1;0.42 0 0.58 1";

function Box({
  x, y, z = 0, w, d, h, top, left, right, opacity = 1, h2, dur = 3, begin = 0,
}: {
  x: number; y: number; z?: number; w: number; d: number; h: number;
  top: string; left: string; right: string; opacity?: number;
  /** When set, the box height breathes between h and h2 forever. */
  h2?: number; dur?: number; begin?: number;
}) {
  const faces = (hh: number) => [
    /* +y face (viewer's left) */
    pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + hh], [x, y + d, z + hh]]),
    /* +x face (viewer's right) */
    pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + hh], [x + w, y, z + hh]]),
    pts([[x, y, z + hh], [x + w, y, z + hh], [x + w, y + d, z + hh], [x, y + d, z + hh]]),
  ];
  const a = faces(h);
  const b = h2 == null ? null : faces(h2);
  return (
    <g opacity={opacity}>
      {[left, right, top].map((fill, i) => (
        <polygon key={i} fill={fill} points={a[i]}>
          {b && (
            <animate
              attributeName="points"
              values={`${a[i]};${b[i]};${a[i]}`}
              dur={`${dur}s`}
              begin={`${begin}s`}
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0;0.5;1"
              keySplines={EASE_SPLINES}
            />
          )}
        </polygon>
      ))}
    </g>
  );
}

/** Polygon lying flat on the plane z = const. */
const flat = (corners: [number, number][], z: number) => pts(corners.map(([x, y]) => [x, y, z] as P3));

const circleOnFloor = (cx: number, cy: number, r: number, z: number, from = 0, to = Math.PI * 2, n = 48) => {
  const out: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z]);
  }
  return out;
};

function DonutSlice({ cx, cy, r, ri, z, a0, a1, fill }: { cx: number; cy: number; r: number; ri: number; z: number; a0: number; a1: number; fill: string }) {
  const outer = circleOnFloor(cx, cy, r, z, a0, a1, 24);
  const inner = circleOnFloor(cx, cy, ri, z, a0, a1, 24).reverse();
  return <polygon fill={fill} points={pts([...outer, ...inner])} />;
}

/* Catmull-Rom sampling of the paper's centre-line in the x–z plane. */
function sampleCurve(ctrl: [number, number][], perSeg = 8): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

const PAPER_Y0 = 2.2;
const PAPER_Y1 = 7.8;
const PAPER_PATH = sampleCurve([
  [0.15, 4.3], [1.0, 5.2], [2.2, 5.55], [3.3, 5.05], [4.0, 3.9], [4.4, 2.4], [4.75, 1.1],
  [5.4, 0.55], [6.3, 0.43], [7.0, 0.43], [7.6, 0.1], [8.4, 0], [12, 0], [16, 0],
  [16.7, 0.25], [17.0, 0.8], [16.75, 1.2], [16.35, 1.05],
]);

/** Counts up to `target` once after `delayMs`; returns the target immediately when motion is reduced. */
function useCountUp(target: number, reduce: boolean, delayMs = 1100, durMs = 1600) {
  const [value, setValue] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce) {
      setValue(target);
      return;
    }
    let raf = 0;
    const timer = window.setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durMs);
        setValue(target * (1 - Math.pow(1 - t, 3)));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, reduce, delayMs, durMs]);
  return value;
}

/** Background twinkles drifting upward. */
const SPARKLES = [
  { x: 120, y: 300, s: 7, delay: 0 },
  { x: 610, y: 120, s: 9, delay: 1.2 },
  { x: 880, y: 420, s: 6, delay: 2.1 },
  { x: 300, y: 560, s: 8, delay: 0.7 },
  { x: 770, y: 250, s: 5, delay: 2.8 },
  { x: 520, y: 640, s: 6, delay: 1.7 },
  { x: 940, y: 120, s: 7, delay: 3.4 },
  { x: 60, y: 520, s: 5, delay: 2.4 },
];
const star = (s: number) => `M0 ${-s} Q${s * 0.18} ${-s * 0.18} ${s} 0 Q${s * 0.18} ${s * 0.18} 0 ${s} Q${-s * 0.18} ${s * 0.18} ${-s} 0 Q${-s * 0.18} ${-s * 0.18} 0 ${-s} Z`;

/* ───────── scene ───────── */

export function IntegrityReportIllustration({ className }: { className?: string }) {
  const reduce = !!useReducedMotion();
  const anim = !reduce;
  const identityScore = useCountUp(99.2, reduce);

  // Larger iso-y draws further left, so heights grow as y decreases (left → right).
  const BAR_X = 4.2;
  const bars = [
    { y: -3.6, h: 1.7 },
    { y: -5.0, h: 2.4 },
    { y: -6.4, h: 3.1 },
    { y: -7.8, h: 3.9 },
  ];
  const arrow = [iso(BAR_X + 0.6, -3.0, 3.2), iso(BAR_X + 0.6, -4.9, 4.3), iso(BAR_X + 0.6, -6.2, 3.9), iso(BAR_X + 0.6, -8.4, 5.6)];
  const [ax, ay] = arrow[3];
  const [px, py] = arrow[2];
  const ang = Math.atan2(ay - py, ax - px);
  const head = (r: number, a: number) => `${(ax + Math.cos(ang + a) * r).toFixed(1)},${(ay + Math.sin(ang + a) * r).toFixed(1)}`;

  const [shX, shY] = iso(-0.6, 5.2, 8.6);
  const [personX, personY] = iso(14.3, -0.9, 0);

  return (
    <svg
      viewBox="0 0 1000 680"
      role="img"
      aria-label="Illustration: a laptop prints an integrity report with charts while a faculty reviewer inspects it; analytics bars and an arrow rise in the background."
      className={className}
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      <defs>
        <linearGradient id="iri-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3d5af1" />
          <stop offset="0.55" stopColor="#3347d6" />
          <stop offset="1" stopColor="#4c35c9" />
        </linearGradient>
        <radialGradient id="iri-glow" cx="0.45" cy="0.35" r="0.65">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="iri-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e1b4b" />
          <stop offset="1" stopColor="#312e81" />
        </linearGradient>
        <linearGradient id="iri-lens" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e0f2fe" stopOpacity="0.95" />
          <stop offset="1" stopColor="#93c5fd" stopOpacity="0.75" />
        </linearGradient>
        <clipPath id="iri-clip">
          <rect width="1000" height="680" rx="28" />
        </clipPath>
      </defs>

      <g clipPath="url(#iri-clip)">
        {/* Backdrop */}
        <rect width="1000" height="680" fill="url(#iri-bg)" />
        <rect width="1000" height="680" fill="url(#iri-glow)" />
        <g stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1">
          {Array.from({ length: 34 }, (_, i) => i - 14).map((k) => (
            <React.Fragment key={k}>
              <line x1={iso(k, -16)[0]} y1={iso(k, -16)[1]} x2={iso(k, 22)[0]} y2={iso(k, 22)[1]} />
              <line x1={iso(-16, k)[0]} y1={iso(-16, k)[1]} x2={iso(22, k)[0]} y2={iso(22, k)[1]} />
            </React.Fragment>
          ))}
        </g>

        {/* Twinkling sparkles */}
        {anim &&
          SPARKLES.map((sp, i) => (
            <motion.g
              key={i}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [0, 0.9, 0], y: [0, -40], rotate: [0, 90] }}
              transition={{ duration: 4.5, delay: sp.delay, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            >
              <path d={star(sp.s)} transform={`translate(${sp.x} ${sp.y})`} fill="#ffffff" />
            </motion.g>
          ))}

        {/* Floor shadows */}
        <g fill="#1e2a8a" opacity="0.28">
          <polygon points={flat([[0.4, 0.6], [7.6, 0.6], [7.6, 10.6], [0.4, 10.6]], -0.02)} />
          <polygon points={flat([[8.4, 2.6], [17.2, 2.6], [17.2, 8.3], [8.4, 8.3]], -0.02)} />
          <polygon points={flat([[4.5, -8.2], [6.6, -8.2], [6.6, -2.0], [4.5, -2.0]], -0.02)} />
        </g>

        {/* Rising analytics bars */}
        {bars.map((b, i) => (
          <motion.g
            key={b.y}
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            <Box
              x={BAR_X} y={b.y} w={1.25} d={1.25} h={b.h}
              h2={anim ? b.h + 0.55 : undefined} dur={2.6 + i * 0.3} begin={i * 0.35}
              top="#ffffff" left="#dbe3ff" right="#bccafc"
            />
          </motion.g>
        ))}

        {/* Growth arrow: draws itself, holds, fades, repeats */}
        <motion.polyline
          points={arrow.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ")}
          fill="none"
          stroke="#ff5a6e"
          strokeWidth="16"
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0, opacity: 1 }}
          animate={reduce ? { pathLength: 1 } : { pathLength: [0, 1, 1, 1], opacity: [1, 1, 1, 0] }}
          transition={
            reduce
              ? undefined
              : { duration: 4.5, delay: 0.7, times: [0, 0.3, 0.88, 1], repeat: Infinity, ease: "easeInOut" }
          }
        />
        <motion.polygon
          points={`${head(30, 0)} ${head(22, 2.4)} ${head(22, -2.4)}`}
          fill="#ff5a6e"
          initial={reduce ? false : { opacity: 0 }}
          animate={reduce ? { opacity: 1 } : { opacity: [0, 0, 1, 1, 0] }}
          transition={
            reduce
              ? undefined
              : { duration: 4.5, delay: 0.7, times: [0, 0.28, 0.33, 0.88, 1], repeat: Infinity, ease: "easeOut" }
          }
        />

        {/* Laptop base + keyboard */}
        <Box x={0} y={0} w={7} d={10} h={0.42} top="#f8fafc" left="#c7d2fe" right="#e0e7ff" />
        <g fill="#e2e8f0">
          {Array.from({ length: 4 }).flatMap((_, r) =>
            Array.from({ length: 9 }).map((__, c) => (
              <polygon
                key={`${r}-${c}`}
                points={flat([[0.9 + r * 0.72, 0.8 + c * 0.95], [1.45 + r * 0.72, 0.8 + c * 0.95], [1.45 + r * 0.72, 1.55 + c * 0.95], [0.9 + r * 0.72, 1.55 + c * 0.95]], 0.43)}
              />
            )),
          )}
          <polygon fill="#e9edf5" points={flat([[4.4, 3.6], [6.3, 3.6], [6.3, 6.4], [4.4, 6.4]], 0.43)} />
        </g>

        {/* Laptop screen */}
        <Box x={-0.35} y={0} z={0.42} w={0.35} d={10} h={6.4} top="#e2e8f0" left="#cbd5e1" right="#f1f5f9" />
        <polygon fill="url(#iri-screen)" points={pts([[0, 0.45, 0.85], [0, 9.55, 0.85], [0, 9.55, 6.45], [0, 0.45, 6.45]])} />
        {/* on-screen dashboard */}
        <g>
          {[2.0, 3.1, 2.4, 3.9, 3.2].map((h, i) => {
            const bar = (hh: number) =>
              pts([[0, 1.3 + i * 0.85, 1.4], [0, 1.85 + i * 0.85, 1.4], [0, 1.85 + i * 0.85, 1.4 + hh * 0.6], [0, 1.3 + i * 0.85, 1.4 + hh * 0.6]]);
            const low = Math.max(0.8, h - 1.4);
            return (
              <polygon key={i} fill={i % 2 ? "#a78bfa" : "#60a5fa"} opacity="0.9" points={bar(h)}>
                {anim && (
                  <animate
                    attributeName="points"
                    values={`${bar(h)};${bar(low)};${bar(h)}`}
                    dur={`${1.6 + (i % 3) * 0.35}s`}
                    begin={`${i * 0.2}s`}
                    repeatCount="indefinite"
                    calcMode="spline"
                    keyTimes="0;0.5;1"
                    keySplines={EASE_SPLINES}
                  />
                )}
              </polygon>
            );
          })}
          <motion.polyline
            fill="none"
            stroke="#5eead4"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={[[6.0, 3.0], [6.7, 3.9], [7.4, 3.4], [8.1, 4.6], [8.9, 4.2]]
              .map(([y, z]) => iso(0, y, z).map((n) => n.toFixed(1)).join(","))
              .join(" ")}
            initial={reduce ? false : { pathLength: 0 }}
            animate={reduce ? { pathLength: 1 } : { pathLength: [0, 1, 1], opacity: [1, 1, 0.2] }}
            transition={reduce ? undefined : { duration: 3, times: [0, 0.55, 1], repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.polygon
            fill="#ffffff"
            points={pts([[0, 6.0, 5.2], [0, 9.0, 5.2], [0, 9.0, 5.6], [0, 6.0, 5.6]])}
            initial={{ opacity: 0.18 }}
            animate={reduce ? undefined : { opacity: [0.18, 0.45, 0.18] }}
            transition={{ duration: 1.1, repeat: Infinity }}
          />
          {/* scan line sweeping down the screen */}
          {anim && (
            <motion.polygon
              fill="#5eead4"
              points={pts([[0, 0.45, 6.35], [0, 9.55, 6.35], [0, 9.55, 6.2], [0, 0.45, 6.2]])}
              initial={{ y: 0, opacity: 0 }}
              animate={{ y: [0, 160], opacity: [0, 0.55, 0.55, 0] }}
              transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 0.6, ease: "linear" }}
            />
          )}
        </g>

        {/* Report ribbon rolling out of the screen */}
        <g>
          {PAPER_PATH.slice(0, -1).map(([x0, z0], i) => {
            const [x1, z1] = PAPER_PATH[i + 1];
            const slope = Math.min(1, Math.abs(z1 - z0) / (Math.hypot(x1 - x0, z1 - z0) || 1));
            const facingUp = z1 <= z0 || x1 > x0;
            const shade = facingUp ? 255 - Math.round(slope * 26) : 222;
            const fill = `rgb(${shade - 6},${shade - 3},${Math.min(255, shade + 2)})`;
            return (
              <polygon
                key={i}
                fill={fill}
                stroke={fill}
                strokeWidth="0.8"
                points={pts([[x0, PAPER_Y0, z0], [x1, PAPER_Y0, z1], [x1, PAPER_Y1, z1], [x0, PAPER_Y1, z0]])}
              />
            );
          })}
        </g>

        {/* Printed report content (flat section on the floor) */}
        <g>
          <polygon fill="#4f46e5" points={flat([[8.9, 2.9], [9.35, 2.9], [9.35, 6.4], [8.9, 6.4]], 0.01)} />
          <polygon fill="#c7d2fe" points={flat([[8.9, 6.7], [9.35, 6.7], [9.35, 7.4], [8.9, 7.4]], 0.01)} />

          <DonutSlice cx={10.9} cy={6.1} r={0.95} ri={0.5} z={0.01} a0={0} a1={Math.PI * 1.25} fill="#4f46e5" />
          <DonutSlice cx={10.9} cy={6.1} r={0.95} ri={0.5} z={0.01} a0={Math.PI * 1.25} a1={Math.PI * 1.7} fill="#a78bfa" />
          <DonutSlice cx={10.9} cy={6.1} r={0.95} ri={0.5} z={0.01} a0={Math.PI * 1.7} a1={Math.PI * 2} fill="#ff5a6e" />

          {[10.2, 10.75, 11.3].map((x, i) => (
            <polygon key={x} fill="#cbd5e1" points={flat([[x, 2.8], [x + 0.18, 2.8], [x + 0.18, i === 1 ? 4.2 : 4.7], [x, i === 1 ? 4.2 : 4.7]], 0.01)} />
          ))}

          {[1.25, 0.8, 1.45, 0.65, 1.1].map((len, k) => {
            const row = (l: number) =>
              flat([[14.3 - l, 2.95 + k * 0.82], [14.3, 2.95 + k * 0.82], [14.3, 3.45 + k * 0.82], [14.3 - l, 3.45 + k * 0.82]], 0.01);
            return (
              <polygon key={k} fill={["#4f46e5", "#a78bfa", "#4f46e5", "#ff5a6e", "#60a5fa"][k]} points={row(len)}>
                {/* each row "prints" in turn, then holds */}
                {anim && (
                  <animate
                    attributeName="points"
                    values={`${row(0.05)};${row(0.05)};${row(len)};${row(len)}`}
                    keyTimes={`0;${(k * 0.12).toFixed(2)};${(k * 0.12 + 0.15).toFixed(2)};1`}
                    dur="5s"
                    repeatCount="indefinite"
                  />
                )}
              </polygon>
            );
          })}
          {[12.4, 12.85].map((x) => (
            <polygon key={x} fill="#e2e8f0" points={flat([[x, 2.8], [x + 0.16, 2.8], [x + 0.16, 7.2], [x, 7.2]], 0.01)} />
          ))}

          {/* verified seal with a ripple */}
          {anim && (
            <polygon fill="none" stroke="#10b981" strokeWidth="2.5" points={pts(circleOnFloor(15.3, 6.3, 0.62, 0.01))}>
              <animate
                attributeName="points"
                values={`${pts(circleOnFloor(15.3, 6.3, 0.62, 0.01))};${pts(circleOnFloor(15.3, 6.3, 1.35, 0.01))}`}
                dur="2s"
                repeatCount="indefinite"
              />
              <animate attributeName="opacity" values="0.9;0" dur="2s" repeatCount="indefinite" />
            </polygon>
          )}
          <polygon fill="#10b981" points={pts(circleOnFloor(15.3, 6.3, 0.62, 0.01))} />
          <polyline
            fill="none"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={([[15.15, 6.65], [15.45, 6.4], [15.0, 5.95]] as [number, number][])
              .map(([x, y]) => iso(x, y, 0.02).map((n) => n.toFixed(1)).join(","))
              .join(" ")}
          />
          <polyline
            fill="none"
            stroke="#94a3b8"
            strokeWidth="2.2"
            strokeLinejoin="round"
            points={([[14.9, 3.0], [15.3, 3.6], [15.0, 4.2], [15.5, 4.8]] as [number, number][])
              .map(([x, y]) => iso(x, y, 0.02).map((n) => n.toFixed(1)).join(","))
              .join(" ")}
          />
        </g>

        {/* Magnifying glass */}
        <motion.g
          animate={reduce ? undefined : { x: [0, 70, 105, 40, 0], y: [0, -38, -18, -30, 0], rotate: [0, -4, 3, -2, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          <polygon fill="#1e2a8a" opacity="0.28" points={pts(circleOnFloor(9.0, 12.2, 1.6, -0.02))} />
          <Box x={10.35} y={11.9} z={0.05} w={2.3} d={0.6} h={0.32} top="#eef2ff" left="#a5b4fc" right="#c7d2fe" />
          <Box x={12.65} y={11.9} z={0.05} w={0.85} d={0.6} h={0.32} top="#fdba74" left="#ea580c" right="#fb923c" />
          <polygon fill="#a5b4fc" points={pts(circleOnFloor(9.0, 12.2, 1.55, 0.05))} />
          <polygon fill="#eef2ff" points={pts(circleOnFloor(9.0, 12.2, 1.55, 0.38))} />
          <polygon fill="url(#iri-lens)" points={pts(circleOnFloor(9.0, 12.2, 1.18, 0.39))} />
          <motion.polyline
            animate={reduce ? undefined : { opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.8, repeat: Infinity }}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.85"
            strokeWidth="3"
            strokeLinecap="round"
            points={circleOnFloor(9.0, 12.2, 0.85, 0.4, Math.PI * 1.05, Math.PI * 1.45, 10)
              .map((p) => iso(...p).map((n) => n.toFixed(1)).join(","))
              .join(" ")}
          />
        </motion.g>

        {/* Faculty reviewer */}
        <g transform={`translate(${personX.toFixed(1)} ${personY.toFixed(1)})`}>
          <ellipse cx="0" cy="2" rx="30" ry="9" fill="#1e2a8a" opacity="0.3" />
          <rect x="-11" y="-64" width="9" height="64" rx="3" fill="#1f2a44" />
          <rect x="2" y="-64" width="9" height="64" rx="3" fill="#2a3758" />
          <ellipse cx="-7" cy="-1" rx="8" ry="3.5" fill="#111827" />
          <ellipse cx="7" cy="-1" rx="8" ry="3.5" fill="#111827" />
          {/* upper body bobs gently */}
          <g>
            {anim && (
              <animateTransform attributeName="transform" type="translate" values="0 0;0 -2.5;0 0" dur="2.4s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines={EASE_SPLINES} />
            )}
            <rect x="-18" y="-124" width="36" height="66" rx="10" fill="#263256" />
            <path d="M-6 -124 L0 -108 L6 -124 Z" fill="#ffffff" />
            <path d="M-2 -116 L0 -96 L2 -116 Z" fill="#7c3aed">
              {anim && <animateTransform attributeName="transform" type="rotate" values="0 0 -116;6 0 -116;-6 0 -116;0 0 -116" dur="2.4s" repeatCount="indefinite" />}
            </path>
            {/* pointing arm: presenting gesture */}
            <g>
              {anim && (
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="0 -14 -116;16 -14 -116;4 -14 -116;16 -14 -116;0 -14 -116"
                  keyTimes="0;0.25;0.5;0.75;1"
                  dur="2.8s"
                  repeatCount="indefinite"
                  calcMode="spline"
                  keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
                />
              )}
              <path d="M-14 -116 L-46 -134" stroke="#263256" strokeWidth="9" strokeLinecap="round" />
              <circle cx="-49" cy="-136" r="5" fill="#e8b48a" />
            </g>
            {/* arm holding tablet */}
            <g>
              {anim && (
                <animateTransform attributeName="transform" type="rotate" values="0 14 -114;-7 14 -114;0 14 -114" dur="3.2s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines={EASE_SPLINES} />
              )}
              <path d="M14 -114 L22 -88" stroke="#263256" strokeWidth="9" strokeLinecap="round" />
              <rect x="14" y="-98" width="20" height="26" rx="3" fill="#e0e7ff" transform="rotate(-12 24 -85)" />
              <rect x="17" y="-95" width="14" height="19" rx="2" fill="#6366f1" transform="rotate(-12 24 -85)">
                {anim && <animate attributeName="fill" values="#6366f1;#22c55e;#6366f1" dur="3.2s" repeatCount="indefinite" />}
              </rect>
            </g>
            {/* head: tilts, blinks, smiles */}
            <rect x="-5" y="-131" width="10" height="9" fill="#e8b48a" />
            <g>
              {anim && (
                <animateTransform attributeName="transform" type="rotate" values="0 0 -128;7 0 -128;-4 0 -128;0 0 -128" keyTimes="0;0.35;0.7;1" dur="5s" repeatCount="indefinite" />
              )}
              <circle cx="0" cy="-142" r="14" fill="#e8b48a" />
              <path d="M-14 -144 Q-13 -160 1 -158 Q15 -158 14 -144 Q8 -151 -1 -150 Q-9 -149 -14 -144 Z" fill="#2b2b33" />
              {[-5, 5].map((ex) => (
                <ellipse key={ex} cx={ex} cy="-141" rx="1.6" ry="2" fill="#1f2937">
                  {anim && <animate attributeName="ry" values="2;2;0.2;2" keyTimes="0;0.92;0.96;1" dur="3.6s" repeatCount="indefinite" />}
                </ellipse>
              ))}
              <path d="M-4 -135 Q0 -131.5 4 -135" fill="none" stroke="#9a5b3c" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="-8.5" cy="-136.5" r="2.2" fill="#f4a3a3" opacity="0.6" />
              <circle cx="8.5" cy="-136.5" r="2.2" fill="#f4a3a3" opacity="0.6" />
            </g>
          </g>
        </g>

        {/* Floating integrity shield */}
        <motion.g
          animate={reduce ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        >
          <g transform={`translate(${shX.toFixed(1)} ${shY.toFixed(1)})`}>
            {anim && (
              <circle r="46" fill="none" stroke="#ffffff" strokeWidth="2">
                <animate attributeName="r" values="46;72" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.45;0" dur="2.4s" repeatCount="indefinite" />
              </circle>
            )}
            <circle r="46" fill="#ffffff" opacity="0.12" />
            <g>
              {anim && (
                <animateTransform attributeName="transform" type="rotate" values="0;-6;6;0" keyTimes="0;0.3;0.7;1" dur="3.5s" repeatCount="indefinite" />
              )}
              <path d="M0 -32 L26 -22 L26 2 Q26 24 0 36 Q-26 24 -26 2 L-26 -22 Z" fill="#10b981" stroke="#ffffff" strokeWidth="3" />
              <motion.path
                d="M-11 1 L-3 9 L13 -8"
                fill="none"
                stroke="#ffffff"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduce ? false : { pathLength: 0 }}
                animate={reduce ? { pathLength: 1 } : { pathLength: [0, 1, 1, 0] }}
                transition={reduce ? undefined : { duration: 3.5, times: [0, 0.2, 0.85, 1], repeat: Infinity, ease: "easeOut" }}
              />
            </g>
          </g>
        </motion.g>

        {/* Floating labels */}
        <motion.g
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.1 }}
        >
          <motion.g
            animate={reduce ? undefined : { y: [0, -6, 0] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: 1.7 }}
          >
            <g transform="translate(36 36)">
              <rect width="206" height="58" rx="14" fill="#ffffff" />
              <circle cx="30" cy="29" r="15" fill="#e0e7ff" />
              <path d="M23 29 L28 34 L37 24" fill="none" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <text x="54" y="25" fontSize="12" fill="#64748b" fontFamily="Inter, system-ui, sans-serif">Identity</text>
              <text x="54" y="43" fontSize="15" fontWeight="600" fill="#0f172a" fontFamily="Inter, system-ui, sans-serif">
                Verified · {identityScore.toFixed(1)}%
              </text>
            </g>
          </motion.g>
        </motion.g>
        <motion.g
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.3 }}
        >
          <motion.g
            animate={reduce ? undefined : { y: [0, -6, 0] }}
            transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 2.2 }}
          >
            <g transform="translate(752 596)">
              <rect width="212" height="58" rx="14" fill="#ffffff" />
              {anim && (
                <circle cx="30" cy="29" r="15" fill="none" stroke="#e11d48" strokeWidth="2">
                  <animate attributeName="r" values="15;24" dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0" dur="1.8s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx="30" cy="29" r="15" fill="#ffe4e6" />
              <rect x="23" y="21" width="14" height="17" rx="2" fill="none" stroke="#e11d48" strokeWidth="2.5" />
              <path d="M26.5 27 H33.5 M26.5 32 H31" stroke="#e11d48" strokeWidth="2.2" strokeLinecap="round" />
              <text x="54" y="25" fontSize="12" fill="#64748b" fontFamily="Inter, system-ui, sans-serif">Integrity report</text>
              <text x="54" y="43" fontSize="15" fontWeight="600" fill="#0f172a" fontFamily="Inter, system-ui, sans-serif">Ready for review</text>
            </g>
          </motion.g>
        </motion.g>
      </g>
    </svg>
  );
}

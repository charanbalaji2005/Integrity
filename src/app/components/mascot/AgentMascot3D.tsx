import React, { useEffect, useRef, useState } from "react";

/**
 * "Vigil" — the IntegrityOS agent mascot, rendered live in three.js.
 *
 * A friendly floating proctor-bot: glossy capsule body with a glass visor
 * face, glowing eyes that follow the cursor and blink, a little antenna,
 * two floating hands, a shield badge on the chest and a scanning halo ring.
 * Expression and accent colour can change at any time without rebuilding the
 * scene. three.js is self-hosted under public/vendor and loaded lazily.
 */

const THREE_URL = "/vendor/three-0.169.0/three.module.min.js";

export type MascotExpression = "idle" | "happy" | "wave" | "focus" | "think" | "alert";

export interface AgentMascot3DProps {
  /** Eye / antenna / halo colour (CSS hex). */
  accent?: string;
  expression?: MascotExpression;
  /** Camera distance; smaller = bigger mascot. */
  distance?: number;
  /** Eyes track the cursor anywhere on the page (true) or only over the canvas. */
  trackPage?: boolean;
  onPoke?: () => void;
  className?: string;
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

let threePromise: Promise<any> | null = null;
function loadThree() {
  // Absolute URL on purpose: Vite rewrites root-relative dynamic imports.
  threePromise ??= import(/* @vite-ignore */ new URL(THREE_URL, window.location.origin).href);
  return threePromise;
}

export function AgentMascot3D({
  accent = "#4f6bff",
  expression = "idle",
  distance = 6.2,
  trackPage = true,
  onPoke,
  className = "absolute inset-0",
}: AgentMascot3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const accentRef = useRef(accent);
  const exprRef = useRef<MascotExpression>(expression);
  const pokeRef = useRef(0);
  const distanceRef = useRef(distance);
  accentRef.current = accent;
  exprRef.current = expression;
  distanceRef.current = distance;
  const [state, setState] = useState<"loading" | "ready" | "fallback">("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    const start = async () => {
      if (!webglAvailable()) return setState("fallback");
      let THREE: any;
      try {
        THREE = await loadThree();
      } catch {
        if (!disposed) setState("fallback");
        return;
      }
      if (disposed) return;

      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const W = () => host.clientWidth || 1;
      const H = () => host.clientHeight || 1;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(W(), H());
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.domElement.style.display = "block";
      renderer.domElement.setAttribute("aria-hidden", "true");
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, W() / H(), 0.1, 100);
      camera.position.set(0, 0.25, distanceRef.current);

      scene.add(new THREE.HemisphereLight(0xffffff, 0xd6dbf0, 1.5));
      const key = new THREE.DirectionalLight(0xffffff, 2.4);
      key.position.set(3, 5, 6);
      scene.add(key);
      const rim = new THREE.PointLight(new THREE.Color(accentRef.current), 18, 12);
      rim.position.set(-3, 1.5, -2);
      scene.add(rim);

      const accentColor = new THREE.Color(accentRef.current);
      const glowMat = () =>
        new THREE.MeshStandardMaterial({ color: accentColor.clone(), emissive: accentColor.clone(), emissiveIntensity: 1.6, roughness: 0.3 });

      // ── Rig ───────────────────────────────────────────────
      const root = new THREE.Group(); // bobbing + jumping
      scene.add(root);
      const body = new THREE.Group(); // tilts toward pointer
      root.add(body);

      const shellMat = new THREE.MeshPhysicalMaterial({
        color: 0xf7f8fc,
        roughness: 0.22,
        metalness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        sheen: 0.4,
        sheenColor: new THREE.Color(0xdfe4ff),
      });
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.82, 0.55, 16, 40), shellMat);
      body.add(torso);

      // Glass visor
      const visor = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.36, 0.42, 12, 32),
        new THREE.MeshPhysicalMaterial({ color: 0x12142a, roughness: 0.12, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02 }),
      );
      visor.rotation.z = Math.PI / 2;
      visor.scale.set(1, 1, 0.42);
      visor.position.set(0, 0.32, 0.74);
      body.add(visor);

      // Eyes (open = capsule, happy = arc)
      const face = new THREE.Group();
      face.position.set(0, 0.33, 0.9);
      body.add(face);
      const eyeMat = glowMat();
      const mkEye = (x: number) => {
        const g = new THREE.Group();
        g.position.x = x;
        const open = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.11, 6, 16), eyeMat);
        const happy = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.028, 8, 24, Math.PI), eyeMat);
        happy.visible = false;
        g.add(open, happy);
        face.add(g);
        return { g, open, happy };
      };
      const eyes = [mkEye(-0.22), mkEye(0.22)];

      // Mouth: smile arc / small "o" for alert
      const smile = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 8, 24, Math.PI), eyeMat);
      smile.rotation.z = Math.PI;
      smile.position.set(0, -0.17, 0);
      face.add(smile);
      const oMouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.02, 8, 20), eyeMat);
      oMouth.position.set(0, -0.19, 0);
      oMouth.visible = false;
      face.add(oMouth);

      // Cheeks
      const cheekMat = new THREE.MeshBasicMaterial({ color: 0xff8fb1, transparent: true, opacity: 0.0 });
      const cheeks = [-0.42, 0.42].map((x) => {
        const c = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), cheekMat);
        c.position.set(x * 0.85, -0.1, -0.02);
        face.add(c);
        return c;
      });

      // Antenna
      const antenna = new THREE.Group();
      antenna.position.set(0, 1.08, 0);
      body.add(antenna);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.32, 10), shellMat);
      stalk.position.y = 0.16;
      antenna.add(stalk);
      const tipMat = glowMat();
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 20), tipMat);
      tip.position.y = 0.36;
      antenna.add(tip);

      // Shield badge on chest
      const shieldShape = new THREE.Shape();
      shieldShape.moveTo(0, 0.17);
      shieldShape.quadraticCurveTo(0.08, 0.13, 0.15, 0.14);
      shieldShape.quadraticCurveTo(0.16, -0.06, 0, -0.18);
      shieldShape.quadraticCurveTo(-0.16, -0.06, -0.15, 0.14);
      shieldShape.quadraticCurveTo(-0.08, 0.13, 0, 0.17);
      const badgeMat = glowMat();
      badgeMat.emissiveIntensity = 0.7;
      const badge = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shieldShape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 }),
        badgeMat,
      );
      badge.position.set(0, -0.42, 0.8);
      badge.rotation.x = -0.18;
      body.add(badge);

      // Floating hands
      const handGeo = new THREE.SphereGeometry(0.17, 24, 24);
      const hands = [-1, 1].map((side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 1.08, -0.15, 0.1);
        root.add(pivot);
        const hand = new THREE.Mesh(handGeo, shellMat);
        hand.scale.set(1, 1.15, 0.85);
        pivot.add(hand);
        return { pivot, hand, side };
      });

      // Scanning halo + ground shadow
      const haloMat = new THREE.MeshBasicMaterial({ color: accentColor.clone(), transparent: true, opacity: 0.45, depthWrite: false });
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.012, 8, 120), haloMat);
      halo.rotation.x = Math.PI / 2;
      root.add(halo);
      const haloGlow = new THREE.Mesh(
        new THREE.RingGeometry(0.95, 1.35, 96),
        new THREE.MeshBasicMaterial({ color: accentColor.clone(), transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
      );
      haloGlow.rotation.x = -Math.PI / 2;
      root.add(haloGlow);

      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.85, 40),
        new THREE.MeshBasicMaterial({ color: 0x1b1d3a, transparent: true, opacity: 0.16, depthWrite: false }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = -1.75;
      scene.add(shadow);

      // Sparkles
      const sparkCount = 60;
      const sp = new Float32Array(sparkCount * 3);
      for (let i = 0; i < sparkCount; i++) {
        const r = 1.6 + Math.random() * 1.4;
        const a = Math.random() * Math.PI * 2;
        sp[i * 3] = Math.cos(a) * r;
        sp[i * 3 + 1] = (Math.random() - 0.5) * 3;
        sp[i * 3 + 2] = Math.sin(a) * r * 0.6;
      }
      const sparkGeo = new THREE.BufferGeometry();
      sparkGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
      const sparkMat = new THREE.PointsMaterial({ color: accentColor.clone(), size: 0.045, transparent: true, opacity: 0.6, depthWrite: false });
      const sparks = new THREE.Points(sparkGeo, sparkMat);
      scene.add(sparks);

      // ── Pointer tracking ─────────────────────────────────
      const look = { x: 0, y: 0 };
      const lookNow = { x: 0, y: 0 };
      const onMove = (e: PointerEvent) => {
        const r = host.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height * 0.42;
        const span = trackPage ? Math.max(window.innerWidth, 600) / 2 : r.width / 2;
        look.x = Math.max(-1, Math.min(1, (e.clientX - cx) / span));
        look.y = Math.max(-1, Math.min(1, (e.clientY - cy) / span));
      };
      const onLeave = () => {
        look.x = 0;
        look.y = 0;
      };
      const moveTarget: any = trackPage ? window : host;
      moveTarget.addEventListener("pointermove", onMove);
      if (!trackPage) host.addEventListener("pointerleave", onLeave);

      const onClick = () => {
        pokeRef.current = performance.now();
        onPoke?.();
      };
      host.addEventListener("click", onClick);

      // ── Animation ────────────────────────────────────────
      const clock = new THREE.Clock();
      let nextBlink = 1.5;
      let blinkT = -1;
      let raf = 0;
      let running = false;
      const tmpColor = new THREE.Color();

      const frame = (t: number) => {
        const expr = exprRef.current;
        tmpColor.set(accentRef.current);
        for (const m of [eyeMat, tipMat, badgeMat]) {
          m.color.lerp(tmpColor, 0.08);
          m.emissive.lerp(tmpColor, 0.08);
        }
        haloMat.color.lerp(tmpColor, 0.08);
        (haloGlow.material as any).color.lerp(tmpColor, 0.08);
        sparkMat.color.lerp(tmpColor, 0.08);
        rim.color.lerp(tmpColor, 0.08);

        // Poke → hop
        const since = (performance.now() - pokeRef.current) / 1000;
        const hop = since < 0.7 ? Math.sin((since / 0.7) * Math.PI) * 0.45 : 0;

        // Bob & breathe
        const bob = reduceMotion ? 0 : Math.sin(t * 1.6) * 0.08;
        root.position.y = bob + hop;
        torso.scale.set(1 + Math.sin(t * 1.6) * 0.008, 1 - Math.sin(t * 1.6) * 0.01, 1);
        const sh = 1 - (bob + hop) * 0.35;
        shadow.scale.set(sh, sh, sh);
        (shadow.material as any).opacity = 0.16 * sh;

        // Look toward pointer (think → look up-left)
        const tx = expr === "think" ? -0.55 : look.x;
        const ty = expr === "think" ? -0.6 : look.y;
        lookNow.x += (tx - lookNow.x) * 0.08;
        lookNow.y += (ty - lookNow.y) * 0.08;
        body.rotation.y = lookNow.x * 0.45;
        body.rotation.x = lookNow.y * 0.22;
        body.rotation.z = (expr === "think" ? 0.12 : 0) + (reduceMotion ? 0 : Math.sin(t * 0.8) * 0.03);
        face.position.x = lookNow.x * 0.07;
        face.position.y = 0.33 - lookNow.y * 0.05;

        // Blink
        if (t > nextBlink && blinkT < 0) blinkT = t;
        let lid = 1;
        if (blinkT >= 0) {
          const p = (t - blinkT) / 0.16;
          lid = p < 1 ? Math.abs(1 - p * 2) * 0.9 + 0.1 : 1;
          if (p >= 1) {
            blinkT = -1;
            nextBlink = t + 2 + Math.random() * 3;
          }
        }
        const happyEyes = expr === "happy" || expr === "wave" || since < 1.2;
        const focusSquint = expr === "focus" ? 0.55 : 1;
        const alertBig = expr === "alert" ? 1.3 : 1;
        for (const e of eyes) {
          e.open.visible = !happyEyes;
          e.happy.visible = happyEyes;
          e.open.scale.set(alertBig, lid * focusSquint * alertBig, 1);
        }
        smile.visible = expr !== "alert";
        oMouth.visible = expr === "alert";
        smile.scale.setScalar(happyEyes ? 1.15 : expr === "focus" ? 0.7 : 0.95);
        cheekMat.opacity += ((happyEyes ? 0.55 : 0) - cheekMat.opacity) * 0.1;

        // Antenna wobble + pulse
        antenna.rotation.z = Math.sin(t * 2.2) * 0.12 - lookNow.x * 0.15;
        antenna.rotation.x = Math.cos(t * 1.7) * 0.08;
        tipMat.emissiveIntensity = (expr === "alert" ? 2.6 : 1.4) + Math.sin(t * (expr === "alert" ? 10 : 3)) * 0.6;

        // Hands
        hands.forEach(({ pivot, side }) => {
          const base = Math.sin(t * 1.6 + side) * 0.06;
          pivot.position.y = -0.15 + base + bob * 0.3;
          pivot.rotation.z = 0;
          if (side === 1 && (expr === "wave" || since < 1.2)) {
            pivot.position.set(1.05, 0.55 + Math.sin(t * 10) * 0.04, 0.25);
            pivot.rotation.z = Math.sin(t * 10) * 0.5;
          } else if (side === -1 && expr === "think") {
            pivot.position.set(-0.35, -0.38, 0.85); // hand on "chin"
          } else if (expr === "focus") {
            pivot.position.set(side * 0.95, -0.4 + base, 0.55);
          } else {
            pivot.position.x = side * 1.08;
            pivot.position.z = 0.1;
          }
        });

        // Scanning halo sweeps up and down the body
        const scanSpeed = expr === "focus" || expr === "alert" ? 2.4 : 1.1;
        const s = Math.sin(t * scanSpeed);
        halo.position.y = s * 1.0;
        halo.scale.setScalar(1 - Math.abs(s) * 0.22);
        haloMat.opacity = 0.25 + (1 - Math.abs(s)) * 0.35;
        haloGlow.position.y = halo.position.y;
        haloGlow.scale.copy(halo.scale);

        sparks.rotation.y = t * 0.12;
        renderer.render(scene, camera);
      };

      const loop = () => {
        raf = requestAnimationFrame(loop);
        frame(clock.getElapsedTime());
      };
      const play = () => {
        if (running || reduceMotion) return;
        running = true;
        loop();
      };
      const pause = () => {
        running = false;
        cancelAnimationFrame(raf);
      };

      const io = new IntersectionObserver(([en]) => (en.isIntersecting ? play() : pause()), { threshold: 0.02 });
      io.observe(host);
      const onVis = () => (document.hidden ? pause() : play());
      document.addEventListener("visibilitychange", onVis);
      const ro = new ResizeObserver(() => {
        camera.aspect = W() / H();
        camera.position.z = camera.aspect < 0.8 ? distanceRef.current * 1.25 : distanceRef.current;
        camera.updateProjectionMatrix();
        renderer.setSize(W(), H());
        if (!running) frame(1);
      });
      ro.observe(host);

      frame(1);
      setState("ready");

      cleanup = () => {
        pause();
        io.disconnect();
        ro.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        moveTarget.removeEventListener("pointermove", onMove);
        host.removeEventListener("pointerleave", onLeave);
        host.removeEventListener("click", onClick);
        scene.traverse((o: any) => {
          o.geometry?.dispose?.();
          const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
          mats.forEach((m: any) => m.dispose?.());
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    };

    const lazy = new IntersectionObserver(
      ([en]) => {
        if (en.isIntersecting) {
          lazy.disconnect();
          start();
        }
      },
      { rootMargin: "300px" },
    );
    lazy.observe(host);

    return () => {
      disposed = true;
      lazy.disconnect();
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackPage]);

  return (
    <div ref={hostRef} className={`${className} ${onPoke ? "cursor-pointer" : ""} touch-pan-y`}>
      {state !== "ready" && <MascotFallback accent={accent} loading={state === "loading"} />}
    </div>
  );
}

/** Flat vector version of the mascot (loading state / no WebGL). */
export function MascotFallback({ accent = "#4f6bff", loading = false }: { accent?: string; loading?: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <svg viewBox="0 0 200 220" className={`h-[70%] max-h-[420px] ${loading ? "animate-pulse" : ""}`}>
        <ellipse cx="100" cy="208" rx="46" ry="7" fill="#1b1d3a" opacity="0.12" />
        <line x1="100" y1="34" x2="100" y2="14" stroke="#e6e8f2" strokeWidth="5" strokeLinecap="round" />
        <circle cx="100" cy="12" r="7" fill={accent} />
        <rect x="45" y="34" width="110" height="160" rx="55" fill="#f7f8fc" stroke="#e3e6f2" strokeWidth="2" />
        <rect x="58" y="70" width="84" height="46" rx="23" fill="#12142a" />
        <rect x="76" y="82" width="10" height="18" rx="5" fill={accent} />
        <rect x="114" y="82" width="10" height="18" rx="5" fill={accent} />
        <path d="M92 106 q8 6 16 0" stroke={accent} strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M100 136 l14 4 q0 18 -14 26 q-14 -8 -14 -26 z" fill={accent} opacity="0.85" />
        <circle cx="30" cy="130" r="13" fill="#f7f8fc" stroke="#e3e6f2" strokeWidth="2" />
        <circle cx="170" cy="130" r="13" fill="#f7f8fc" stroke="#e3e6f2" strokeWidth="2" />
      </svg>
    </div>
  );
}

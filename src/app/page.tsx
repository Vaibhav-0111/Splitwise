"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

/* ──────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────── */
interface Particle3D {
  x: number;
  y: number;
  z: number;
  originX: number;
  originY: number;
  originZ: number;
  torusX: number;
  torusY: number;
  torusZ: number;
  radius: number;
  color: string;
}

/* ──────────────────────────────────────────────────────────────
   Animated Counter Hook
   ────────────────────────────────────────────────────────────── */
function useCounter(target: number, duration: number, start: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf: number;
    const t0 = performance.now();
    const tick = (now: number) => {
      const elapsed = now - t0;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.floor(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return count;
}

/* ══════════════════════════════════════════════════════════════
   LANDING PAGE
   ══════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle3D[]>([]);
  const animFrameRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  /* ── Stats counter triggers ── */
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);
  const usersCount = useCounter(12500, 2000, statsVisible);
  const trackedCount = useCounter(5, 2000, statsVisible);
  const uptimeCount = useCounter(999, 2000, statsVisible);

  /* ── Typewriter Tagline Hook ── */
  const words = ["effortless splits", "magical balances", "elegant sharing", "future finance"];
  const [wordIndex, setWordIndex] = useState(0);
  const [currentText, setCurrentText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentWord = words[wordIndex];
    let timer = setTimeout(() => {
      if (!isDeleting) {
        setCurrentText(currentWord.slice(0, currentText.length + 1));
        if (currentText === currentWord) {
          timer = setTimeout(() => setIsDeleting(true), 2000);
        }
      } else {
        setCurrentText(currentWord.slice(0, currentText.length - 1));
        if (currentText === "") {
          setIsDeleting(false);
          setWordIndex((prev) => (prev + 1) % words.length);
        }
      }
    }, isDeleting ? 30 : 70);

    return () => clearTimeout(timer);
  }, [currentText, isDeleting, wordIndex]);

  /* ── Intersection Observer for reveal-on-scroll ── */
  useEffect(() => {
    const nodes = document.querySelectorAll(".reveal-on-scroll");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("revealed");
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);

  /* ── Stats visibility observer ── */
  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setStatsVisible(true);
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* ── Mouse move tracking ── */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.targetX = (e.clientX - window.innerWidth / 2) * 0.15;
      mouseRef.current.targetY = (e.clientY - window.innerHeight / 2) * 0.15;
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  /* ── Particle Canvas ── */
  const initParticles = useCallback(() => {
    const arr: Particle3D[] = [];
    const count = 180;
    const colors = ["#f59e0b", "#fbbf24", "#8b5cf6", "#06b6d4"];

    for (let i = 0; i < count; i++) {
      // 1. Sphere position formula
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 180 + Math.random() * 40;
      const ox = r * Math.sin(phi) * Math.cos(theta);
      const oy = r * Math.sin(phi) * Math.sin(theta);
      const oz = r * Math.cos(phi);

      // 2. Torus position formula
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * Math.PI * 2;
      const R = 180;
      const rTorus = 50;
      const tx = (R + rTorus * Math.cos(v)) * Math.cos(u);
      const ty = (R + rTorus * Math.cos(v)) * Math.sin(u);
      const tz = rTorus * Math.sin(v);

      arr.push({
        x: ox,
        y: oy,
        z: oz,
        originX: ox,
        originY: oy,
        originZ: oz,
        torusX: tx,
        torusY: ty,
        torusZ: tz,
        radius: Math.random() * 2.2 + 0.8,
        color: colors[i % colors.length],
      });
    }
    particlesRef.current = arr;
  }, []);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);

    const particles = particlesRef.current;
    const time = performance.now() * 0.0004;

    // Smooth ease mouse coordinates
    const mouse = mouseRef.current;
    mouse.x += (mouse.targetX - mouse.x) * 0.08;
    mouse.y += (mouse.targetY - mouse.y) * 0.08;

    // Morph factor between sphere (0) and torus (1) over time
    const morphFactor = Math.sin(time * 0.5) * 0.5 + 0.5; // oscillate 0 to 1

    // Setup 3D rotation angles based on time and mouse coordinates
    const ax = (time * 0.15) + (mouse.y * 0.005);
    const ay = (time * 0.25) + (mouse.x * 0.005);
    const az = time * 0.1;

    const cosX = Math.cos(ax), sinX = Math.sin(ax);
    const cosY = Math.cos(ay), sinY = Math.sin(ay);
    const cosZ = Math.cos(az), sinZ = Math.sin(az);

    const projected: { x: number; y: number; z: number; color: string; r: number }[] = [];

    for (const p of particles) {
      // Linear interpolation for morphing positions
      const targetX = p.originX * (1 - morphFactor) + p.torusX * morphFactor;
      const targetY = p.originY * (1 - morphFactor) + p.torusY * morphFactor;
      const targetZ = p.originZ * (1 - morphFactor) + p.torusZ * morphFactor;

      // 3D rotations
      // Rotate Y
      let x1 = targetX * cosY - targetZ * sinY;
      let z1 = targetZ * cosY + targetX * sinY;

      // Rotate X
      let y2 = targetY * cosX - z1 * sinX;
      let z2 = z1 * cosX + targetY * sinX;

      // Rotate Z
      let x3 = x1 * cosZ - y2 * sinZ;
      let y3 = y2 * cosZ + x1 * sinZ;

      // Projection mapping (focal length)
      const focalLength = 350;
      const scale = focalLength / (focalLength + z2 + 200);
      const projX = w / 2 + x3 * scale;
      const projY = h / 2 + y3 * scale;

      projected.push({
        x: projX,
        y: projY,
        z: z2,
        color: p.color,
        r: p.radius * scale * 1.5,
      });
    }

    // Sort by Z depth to render correct overlapping (depth buffering)
    projected.sort((a, b) => b.z - a.z);

    // Draw interactive 3D connection lines
    ctx.lineWidth = 0.45;
    for (let i = 0; i < projected.length; i++) {
      let connections = 0;
      for (let j = i + 1; j < projected.length; j++) {
        if (connections >= 2) break; // limit connections to maintain high performance
        const dx = projected[i].x - projected[j].x;
        const dy = projected[i].y - projected[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 85) {
          const alpha = (1 - dist / 85) * 0.12 * (1 - (projected[i].z + 200) / 600);
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(projected[i].x, projected[i].y);
          ctx.lineTo(projected[j].x, projected[j].y);
          ctx.stroke();
          connections++;
        }
      }
    }

    // Draw particle points
    for (const p of projected) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.3, p.r), 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      // Add depth shading
      ctx.globalAlpha = Math.max(0.15, Math.min(1, 1 - (p.z + 100) / 400));
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Render static Cyberpunk HUD vector circles in the background center
    ctx.strokeStyle = "rgba(6, 182, 212, 0.08)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 230 + Math.sin(time) * 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(139, 92, 246, 0.06)";
    ctx.lineWidth = 1;
    ctx.setLineDash([15, 30]);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 260 - Math.cos(time) * 3, time, time + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    animFrameRef.current = requestAnimationFrame(drawFrame);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
    };
    resize();
    window.addEventListener("resize", resize);
    animFrameRef.current = requestAnimationFrame(drawFrame);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [initParticles, drawFrame]);


  /* ══════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════ */
  return (
    <main className="relative min-h-screen overflow-hidden bg-mesh">
      {/* ── PARTICLE CANVAS ── */}
      <canvas ref={canvasRef} id="particle-canvas" className="particle-canvas" />

      {/* ── MORPHING BLOBS ── */}
      <div className="blob blob-primary" style={{ width: 480, height: 480, top: "-10%", left: "-5%" }} />
      <div className="blob blob-accent" style={{ width: 380, height: 380, top: "30%", right: "-8%", animationDelay: "4s" }} />
      <div className="blob blob-neon" style={{ width: 320, height: 320, bottom: "5%", left: "25%", animationDelay: "8s" }} />

      {/* ════════════════════════════════════════════════════════
          SECTION 1 — HERO
          ════════════════════════════════════════════════════════ */}
      <section id="hero" className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 text-center">
        {/* Grid overlay */}
        <div className="hero-grid absolute inset-0 pointer-events-none" />

        {/* Badge */}
        <div
          id="hero-badge"
          className="glass mb-6 inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium text-amber-300 animate-fade-up"
        >
          <span className="text-lg">✨</span> The future of shared expenses
        </div>

        {/* Heading */}
        <h1
          id="hero-heading"
          className="font-display max-w-4xl text-5xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl md:text-7xl lg:text-8xl animate-fade-up"
          style={{ animationDelay: "150ms" }}
        >
          Split expenses with
          <br />
          <span className="gradient-text relative inline-block">
            {currentText}
            <span className="inline-block w-[3px] h-[1em] ml-1 bg-amber-400 align-middle animate-blink" />
          </span>
        </h1>

        {/* Subtitle */}
        <p
          id="hero-subtitle"
          className="mt-6 max-w-xl text-lg text-slate-400 animate-fade-up"
          style={{ animationDelay: "300ms" }}
        >
          Splitsy makes group expenses feel magical. Track, split, and settle up
          in seconds — with an experience that feels like the future.
        </p>

        {/* CTA Buttons */}
        <div
          id="hero-cta"
          className="mt-10 flex flex-wrap items-center justify-center gap-4 animate-fade-up"
          style={{ animationDelay: "450ms" }}
        >
          <Link
            href="/login"
            id="cta-get-started"
            className="btn-primary px-8 py-3.5 text-lg shadow-[0_8px_40px_rgba(245,158,11,0.35)]"
          >
            Get Started Free
          </Link>
          <button
            id="cta-watch-demo"
            className="btn-secondary px-8 py-3.5 text-lg"
          >
            ▶ Watch Demo
          </button>
        </div>

        {/* Scroll indicator */}
        <div
          className="absolute bottom-10 flex flex-col items-center gap-2 text-slate-500 animate-fade-up"
          style={{ animationDelay: "700ms" }}
        >
          <span className="text-xs uppercase tracking-widest">Scroll</span>
          <div className="h-8 w-px bg-gradient-to-b from-slate-500 to-transparent animate-pulse" />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 2 — STATS
          ════════════════════════════════════════════════════════ */}
      <section id="stats" ref={statsRef} className="relative z-10 -mt-20 px-4 pb-24">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            { value: `${usersCount.toLocaleString()}+`, label: "Active Users", icon: "👥", delay: "0ms" },
            { value: `$${trackedCount}M+`, label: "Expenses Tracked", icon: "💰", delay: "150ms" },
            { value: `${(uptimeCount / 10).toFixed(1)}%`, label: "Uptime Guaranteed", icon: "⚡", delay: "300ms" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="glass-card hover-lift rounded-2xl p-8 text-center animate-stagger"
              style={{ animationDelay: stat.delay }}
            >
              <div className="mb-3 text-3xl">{stat.icon}</div>
              <div className="font-display text-4xl font-bold text-amber-400 sm:text-5xl">
                {stat.value}
              </div>
              <p className="mt-2 text-sm text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 3 — FEATURES
          ════════════════════════════════════════════════════════ */}
      <section id="features" className="relative z-10 px-4 py-28">
        <h2
          id="features-heading"
          className="font-display mb-16 text-center text-4xl font-bold md:text-5xl reveal-on-scroll"
        >
          Why <span className="gradient-text">Splitsy</span>?
        </h2>

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-3">
          {[
            {
              icon: "⚡",
              color: "from-amber-500/20 to-amber-600/5",
              glowColor: "hover:shadow-[0_0_40px_rgba(245,158,11,0.15)]",
              title: "Lightning Fast",
              desc: "Add expenses in seconds. Real-time sync across all devices with instant balance updates — no refresh needed.",
              delay: "0ms",
            },
            {
              icon: "🔒",
              color: "from-violet-500/20 to-violet-600/5",
              glowColor: "hover:shadow-[0_0_40px_rgba(139,92,246,0.15)]",
              title: "Bank-Grade Security",
              desc: "End-to-end encryption and secure authentication protect every transaction. Your financial data stays yours.",
              delay: "200ms",
            },
            {
              icon: "🧠",
              color: "from-cyan-500/20 to-cyan-600/5",
              glowColor: "hover:shadow-[0_0_40px_rgba(6,182,212,0.15)]",
              title: "Smart Splits",
              desc: "AI-powered suggestions learn your habits and auto-categorize expenses. Splitting has never been this effortless.",
              delay: "400ms",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className={`glass-card tilt-card reveal-on-scroll rounded-2xl p-8 transition-shadow ${feature.glowColor}`}
              style={{ transitionDelay: feature.delay }}
            >
              {/* Icon circle */}
              <div
                className={`mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} text-2xl`}
              >
                {feature.icon}
              </div>
              <h3 className="font-display mb-3 text-xl font-semibold">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 4 — HOW IT WORKS
          ════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="relative z-10 px-4 py-28">
        <h2
          id="how-heading"
          className="font-display mb-20 text-center text-4xl font-bold md:text-5xl reveal-on-scroll"
        >
          How it <span className="gradient-text">works</span>
        </h2>

        <div className="mx-auto max-w-5xl">
          {/* Desktop: horizontal steps with connecting lines */}
          <div className="relative flex flex-col items-start gap-16 md:flex-row md:items-center md:justify-between md:gap-0">
            {/* Connecting line — desktop */}
            <div className="neon-line absolute left-[15%] right-[15%] top-1/2 z-0 hidden md:block" />
            {/* Connecting line — mobile */}
            <div className="neon-line-vertical absolute left-7 top-[10%] bottom-[10%] z-0 md:hidden" style={{ height: "80%" }} />

            {[
              { num: "1", title: "Create Group", desc: "Invite friends with a single link. Set up in under 10 seconds.", delay: "0ms" },
              { num: "2", title: "Add Expenses", desc: "Snap a receipt or type an amount. Splitsy handles the math instantly.", delay: "200ms" },
              { num: "3", title: "Settle Up", desc: "See who owes what. One-tap payments via your favorite method.", delay: "400ms" },
            ].map((step) => (
              <div
                key={step.num}
                className="reveal-on-scroll relative z-10 flex flex-1 flex-col items-center text-center md:px-4"
                style={{ transitionDelay: step.delay }}
              >
                {/* Number circle */}
                <div className="relative mb-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-violet-600 text-xl font-bold text-white shadow-[0_0_30px_rgba(245,158,11,0.3)]">
                    {step.num}
                  </div>
                  {/* Pulse ring */}
                  <div className="absolute inset-0 rounded-full border-2 border-amber-400/30 animate-pulse-ring" />
                </div>
                <h3 className="font-display mb-2 text-lg font-semibold">{step.title}</h3>
                <p className="max-w-[220px] text-sm text-slate-400">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 5 — FINAL CTA
          ════════════════════════════════════════════════════════ */}
      <section id="cta-section" className="relative z-10 px-4 pb-32 pt-12">
        <div
          className="border-gradient mx-auto max-w-4xl rounded-3xl p-[1px]"
        >
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-surface via-[#0d1424] to-surface px-6 py-20 text-center sm:px-16">
            {/* Aurora glow bg */}
            <div
              className="absolute inset-0 opacity-30 animate-aurora"
              style={{
                background:
                  "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(139,92,246,0.15), rgba(6,182,212,0.1), rgba(245,158,11,0.1))",
                backgroundSize: "300% 300%",
              }}
            />

            <div className="relative reveal-on-scroll">
              <h2 className="font-display mb-4 text-3xl font-bold sm:text-5xl">
                Ready to split <span className="gradient-text">smarter</span>?
              </h2>
              <p className="mx-auto mb-10 max-w-lg text-slate-400">
                Join thousands who have ditched spreadsheets and awkward Venmo requests.
                Splitsy is free to start — no credit card required.
              </p>
              <Link
                href="/login"
                id="cta-final"
                className="btn-primary px-10 py-4 text-lg shadow-[0_8px_50px_rgba(245,158,11,0.4)]"
              >
                Get Started — It&apos;s Free
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/5 px-4 py-10 text-center text-sm text-slate-500">
        <p>© {new Date().getFullYear()} Splitsy. Crafted with obsessive attention to detail.</p>
      </footer>
    </main>
  );
}

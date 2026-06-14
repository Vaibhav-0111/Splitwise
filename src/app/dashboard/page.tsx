"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function DashboardPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [greeting, setGreeting] = useState("Good Evening");

  // ── Auth check ──────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setDisplayName(user.displayName || user.email?.split("@")[0] || "User");
        setEmail(user.email || "");
        setLoading(false);
      } else {
        router.push("/login");
      }
    });
    return () => unsub();
  }, [router]);

  // ── Time-based greeting ─────────────────────────────────────
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good Morning");
    else if (hour < 17) setGreeting("Good Afternoon");
    else setGreeting("Good Evening");
  }, []);

  // ── Sign out handler ────────────────────────────────────────
  const handleSignOut = useCallback(async () => {
    await signOut(auth);
    router.push("/login");
  }, [router]);

  // ── Subtle particle canvas ─────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      o: number;
      color: string;
    }[] = [];

    const colors = [
      "rgba(245,158,11,",
      "rgba(139,92,246,",
      "rgba(6,182,212,",
    ];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 30; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 0.5,
        o: Math.random() * 0.3 + 0.05,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.o})`;
        ctx.fill();
      });

      // draw faint connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(245,158,11,${0.03 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // ── Loading state ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="spinner" />
          <p className="text-slate-400 animate-fade-up font-display tracking-wide">
            Loading your dashboard…
          </p>
        </div>
      </div>
    );
  }

  // ── Stats data ──────────────────────────────────────────────
  const stats = [
    {
      id: "stat-balance",
      icon: "💰",
      value: "$0.00",
      label: "Total Balance",
      accent: "from-emerald-500/20 to-emerald-500/0",
      border: "border-emerald-500/20",
      text: "text-emerald-400",
    },
    {
      id: "stat-groups",
      icon: "👥",
      value: "0",
      label: "Active Groups",
      accent: "from-violet-500/20 to-violet-500/0",
      border: "border-violet-500/20",
      text: "text-violet-400",
    },
    {
      id: "stat-month",
      icon: "📊",
      value: "$0.00",
      label: "This Month",
      accent: "from-cyan-500/20 to-cyan-500/0",
      border: "border-cyan-500/20",
      text: "text-cyan-400",
    },
  ];

  // ── Quick actions data ──────────────────────────────────────
  const actions = [
    {
      id: "action-create-group",
      icon: "➕",
      label: "Create Group",
      bg: "bg-amber-500/15",
      href: "/groups",
    },
    {
      id: "action-add-expense",
      icon: "💳",
      label: "Add Expense",
      bg: "bg-violet-500/15",
      href: "#",
    },
    {
      id: "action-settle",
      icon: "🤝",
      label: "Settle Up",
      bg: "bg-emerald-500/15",
      href: "#",
    },
    {
      id: "action-import",
      icon: "📥",
      label: "Import CSV",
      bg: "bg-cyan-500/15",
      href: "#",
    },
  ];

  return (
    <div className="min-h-screen bg-mesh relative overflow-hidden">
      {/* ── Particle canvas ─────────────────────────────────── */}
      <canvas ref={canvasRef} className="particle-canvas" />

      {/* ── Morphing blobs ──────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="blob blob-primary w-72 h-72 opacity-20"
          style={{ top: "10%", left: "5%" }}
        />
        <div
          className="blob blob-accent w-60 h-60 opacity-15"
          style={{ top: "60%", right: "8%", animationDelay: "4s" }}
        />
        <div
          className="blob blob-neon w-48 h-48 opacity-10"
          style={{ bottom: "15%", left: "40%", animationDelay: "8s" }}
        />
      </div>

      {/* ── Top navigation bar ─────────────────────────────── */}
      <nav
        id="dashboard-nav"
        className="sticky top-0 z-50 glass-strong animate-fade-up"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link
            href="/dashboard"
            id="nav-logo"
            className="text-xl font-display font-bold gradient-text-static tracking-tight hover-scale"
          >
            Splitsy
          </Link>

          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400 hidden sm:inline">
              Hi, <span className="text-slate-200 font-medium">{displayName}</span>
            </span>
            <button
              id="sign-out-btn"
              onClick={handleSignOut}
              className="btn-secondary text-sm !py-2 !px-4"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* ── Main content ───────────────────────────────────── */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        {/* ── Welcome section ────────────────────────────── */}
        <section
          id="welcome-section"
          className="animate-slide-left"
        >
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold tracking-tight">
            <span className="gradient-text">{greeting}</span>,{" "}
            <span className="text-white">{displayName}</span>
          </h1>
          <p
            className="mt-3 text-slate-400 text-lg max-w-md"
            style={{ animationDelay: "200ms" }}
          >
            Here&apos;s your financial overview
          </p>
        </section>

        {/* ── Stats grid ─────────────────────────────────── */}
        <section
          id="stats-grid"
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {stats.map((s, i) => (
            <div
              key={s.id}
              id={s.id}
              className="stat-card tilt-card hover-glow animate-stagger"
              style={{ animationDelay: `${300 + i * 120}ms` }}
            >
              {/* Colored corner glow */}
              <div
                className={`absolute -top-8 -left-8 w-32 h-32 rounded-full bg-gradient-to-br ${s.accent} blur-2xl`}
              />

              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-slate-400 text-sm font-medium mb-1">
                    {s.label}
                  </p>
                  <p
                    className={`text-3xl font-display font-bold ${s.text}`}
                  >
                    {s.value}
                  </p>
                </div>
                <span className="text-3xl" role="img" aria-label={s.label}>
                  {s.icon}
                </span>
              </div>
            </div>
          ))}
        </section>

        {/* ── Interactive Financial Trend Chart ────────────────── */}
        <section
          id="financial-chart"
          className="glass-card rounded-2xl p-6 sm:p-8 animate-fade-up relative overflow-hidden"
          style={{ animationDelay: "550ms" }}
        >
          <style>{`
            @keyframes drawPath {
              to { stroke-dashoffset: 0; }
            }
            .path-animated-1 {
              stroke-dasharray: 1000;
              stroke-dashoffset: 1000;
              animation: drawPath 2s ease-out forwards;
              animation-delay: 200ms;
            }
            .path-animated-2 {
              stroke-dasharray: 1000;
              stroke-dashoffset: 1000;
              animation: drawPath 2.5s ease-out forwards;
              animation-delay: 400ms;
            }
          `}</style>
          
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 relative z-10">
            <div>
              <h2 className="text-xl font-display font-semibold text-white">
                Expense & Balance Activity Trend
              </h2>
              <p className="text-slate-400 text-xs mt-1">
                Real-time tracking of shared expenses vs net group settlements
              </p>
            </div>
            
            <div className="flex items-center gap-4 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="w-3 h-3 rounded-full bg-amber-400" />
                Shared Expenses
              </span>
              <span className="flex items-center gap-1.5 text-cyan-400">
                <span className="w-3 h-3 rounded-full bg-cyan-400" />
                Net Balance
              </span>
            </div>
          </div>

          {/* SVG Chart */}
          <div className="relative w-full h-[220px] z-10">
            <svg className="w-full h-full" viewBox="0 0 800 220" preserveAspectRatio="none">
              <defs>
                <linearGradient id="shared-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="balance-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="0" y1="30" x2="800" y2="30" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="0" y1="90" x2="800" y2="90" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="0" y1="150" x2="800" y2="150" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="0" y1="210" x2="800" y2="210" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

              {/* Horizontal labels and vertical grids */}
              {["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((m, idx) => {
                const x = 50 + idx * 140;
                return (
                  <g key={m}>
                    <line x1={x} y1="0" x2={x} y2="210" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                    <text x={x} y="218" fill="rgba(148,163,184,0.6)" fontSize="10" textAnchor="middle" fontFamily="Space Grotesk">
                      {m}
                    </text>
                  </g>
                );
              })}

              {/* Shared Expenses Area and Path */}
              {/* Data values mapping: 120, 280, 190, 510, 430, 680 -> scale factor height 210 */}
              <path
                d="M 50 170 Q 190 130 190 130 T 330 150 T 470 70 T 610 90 T 750 30"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="3.5"
                strokeLinecap="round"
                className="path-animated-1"
              />
              <path
                d="M 50 170 Q 190 130 190 130 T 330 150 T 470 70 T 610 90 T 750 30 L 750 210 L 50 210 Z"
                fill="url(#shared-grad)"
                className="opacity-70"
              />

              {/* Net Balance Area and Path */}
              {/* Data values mapping: 0, 40, -20, 110, 90, 150 */}
              <path
                d="M 50 210 Q 190 180 190 180 T 330 200 T 470 140 T 610 150 T 750 110"
                fill="none"
                stroke="#06b6d4"
                strokeWidth="3.5"
                strokeLinecap="round"
                className="path-animated-2"
              />
              <path
                d="M 50 210 Q 190 180 190 180 T 330 200 T 470 140 T 610 150 T 750 110 L 750 210 L 50 210 Z"
                fill="url(#balance-grad)"
                className="opacity-70"
              />

              {/* Interactive nodes/circles */}
              {/* Shared Expenses dots */}
              <circle cx="50" cy="170" r="4" fill="#030712" stroke="#f59e0b" strokeWidth="2.5" className="hover:scale-150 transition-all duration-300" />
              <circle cx="190" cy="130" r="4" fill="#030712" stroke="#f59e0b" strokeWidth="2.5" className="hover:scale-150 transition-all duration-300" />
              <circle cx="330" cy="150" r="4" fill="#030712" stroke="#f59e0b" strokeWidth="2.5" className="hover:scale-150 transition-all duration-300" />
              <circle cx="470" cy="70" r="4" fill="#030712" stroke="#f59e0b" strokeWidth="2.5" className="hover:scale-150 transition-all duration-300" />
              <circle cx="610" cy="90" r="4" fill="#030712" stroke="#f59e0b" strokeWidth="2.5" className="hover:scale-150 transition-all duration-300" />
              <circle cx="750" cy="30" r="4" fill="#030712" stroke="#f59e0b" strokeWidth="2.5" className="hover:scale-150 transition-all duration-300" />

              {/* Net Balance dots */}
              <circle cx="50" cy="210" r="4" fill="#030712" stroke="#06b6d4" strokeWidth="2.5" className="hover:scale-150 transition-all duration-300" />
              <circle cx="190" cy="180" r="4" fill="#030712" stroke="#06b6d4" strokeWidth="2.5" className="hover:scale-150 transition-all duration-300" />
              <circle cx="330" cy="200" r="4" fill="#030712" stroke="#06b6d4" strokeWidth="2.5" className="hover:scale-150 transition-all duration-300" />
              <circle cx="470" cy="140" r="4" fill="#030712" stroke="#06b6d4" strokeWidth="2.5" className="hover:scale-150 transition-all duration-300" />
              <circle cx="610" cy="150" r="4" fill="#030712" stroke="#06b6d4" strokeWidth="2.5" className="hover:scale-150 transition-all duration-300" />
              <circle cx="750" cy="110" r="4" fill="#030712" stroke="#06b6d4" strokeWidth="2.5" className="hover:scale-150 transition-all duration-300" />
            </svg>
          </div>
        </section>

        {/* ── Quick actions ──────────────────────────────── */}
        <section id="quick-actions">
          <h2 className="text-xl font-display font-semibold text-white mb-5 animate-fade-up">
            Quick Actions
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {actions.map((a, i) => (
              <Link
                key={a.id}
                id={a.id}
                href={a.href}
                className="quick-action animate-stagger text-center"
                style={{ animationDelay: `${600 + i * 100}ms` }}
              >
                <div className={`quick-action-icon ${a.bg}`}>
                  <span className="text-2xl">{a.icon}</span>
                </div>
                <span className="text-sm font-medium text-slate-300">
                  {a.label}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Recent activity ────────────────────────────── */}
        <section
          id="recent-activity"
          className="animate-fade-up"
          style={{ animationDelay: "900ms" }}
        >
          <div className="flex items-center gap-4 mb-6">
            <h2 className="text-xl font-display font-semibold text-white">
              Recent Activity
            </h2>
            <div className="flex-1 neon-line" />
          </div>

          {/* Empty state */}
          <div className="glass-card rounded-2xl p-12 flex flex-col items-center justify-center text-center">
            <div
              className="text-6xl mb-6 animate-float-slow"
              role="img"
              aria-label="No activity"
            >
              📋
            </div>
            <h3 className="text-xl font-display font-semibold text-white mb-2">
              No activity yet
            </h3>
            <p className="text-slate-400 max-w-sm mb-8">
              Create a group and start tracking expenses with friends.
              Your recent transactions will appear here.
            </p>
            <Link
              id="cta-create-group"
              href="/groups"
              className="btn-primary text-sm"
            >
              <span>✨</span>
              Create Your First Group
            </Link>
          </div>
        </section>

        {/* ── Footer spacer ──────────────────────────────── */}
        <div className="h-8" />
      </main>
    </div>
  );
}

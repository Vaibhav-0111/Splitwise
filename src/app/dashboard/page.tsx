"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createClient, deterministicUuid } from "@/lib/supabase/client";

export default function DashboardPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [greeting, setGreeting] = useState("Good Evening");

  // Supabase states
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [userUuid, setUserUuid] = useState<string>("");
  const [totalBalance, setTotalBalance] = useState<number>(0);
  const [activeGroupsCount, setActiveGroupsCount] = useState<number>(0);
  const [thisMonthSpending, setThisMonthSpending] = useState<number>(0);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [chartMonthlySpend, setChartMonthlySpend] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [chartMonthlyNet, setChartMonthlyNet] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [monthsLabels, setMonthsLabels] = useState<string[]>(["Jan", "Feb", "Mar", "Apr", "May", "Jun"]);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalActionType, setModalActionType] = useState<"expense" | "settle" | "import">("expense");

  // ── Auth check and dynamic data fetching ──────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const uid = user.uid;
        setDisplayName(user.displayName || user.email?.split("@")[0] || "User");
        setEmail(user.email || "");

        const supabase = createClient();
        const uuid = deterministicUuid(uid);
        setUserUuid(uuid);

        try {
          // 1. Fetch groups/memberships the user belongs to
          const { data: memberships, error: membershipsError } = await supabase
            .from("group_members")
            .select("group_id, groups(id, name, created_at)")
            .eq("user_id", uuid);

          if (membershipsError) throw membershipsError;

          const userGroups = (memberships ?? [])
            .map((m: any) => m.groups)
            .filter(Boolean);

          setGroups(userGroups);
          setActiveGroupsCount(userGroups.length);

          const groupIds = userGroups.map((g: any) => g.id);

          if (groupIds.length > 0) {
            // 2. Fetch balances per group
            const balancesMap: Record<string, number> = {};
            for (const id of groupIds) balancesMap[id] = 0;

            const [paidRes, owedRes, receivedRes, paidSettleRes] = await Promise.all([
              supabase.from("expenses").select("group_id, amount").eq("paid_by", uuid).in("group_id", groupIds),
              supabase
                .from("expense_splits")
                .select("amount, expenses!inner(group_id)")
                .eq("user_id", uuid)
                .in("expenses.group_id", groupIds),
              supabase.from("settlements").select("group_id, amount").eq("to_user", uuid).in("group_id", groupIds),
              supabase.from("settlements").select("group_id, amount").eq("from_user", uuid).in("group_id", groupIds),
            ]);

            for (const row of paidRes.data ?? []) balancesMap[row.group_id] += Number(row.amount);
            for (const row of (owedRes.data ?? []) as any[]) {
              const gid = row.expenses?.group_id;
              if (gid) balancesMap[gid] -= Number(row.amount);
            }
            for (const row of receivedRes.data ?? []) balancesMap[row.group_id] += Number(row.amount);
            for (const row of paidSettleRes.data ?? []) balancesMap[row.group_id] -= Number(row.amount);

            // Sum all net balances
            const sumBalance = Object.values(balancesMap).reduce((sum, bal) => sum + bal, 0);
            setTotalBalance(sumBalance);

            // 3. Fetch current month's spending
            const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
            const { data: monthlySplits, error: monthlyError } = await supabase
              .from("expense_splits")
              .select("amount, expenses!inner(expense_date)")
              .eq("user_id", uuid)
              .gte("expenses.expense_date", startOfMonth);

            if (monthlyError) throw monthlyError;

            const sumSpending = (monthlySplits ?? []).reduce((sum: number, s: any) => sum + Number(s.amount), 0);
            setThisMonthSpending(sumSpending);

            // 4. Fetch recent activities (top 5 recent expenses/settlements across user's groups)
            const [recentExpensesRes, recentSettlementsRes] = await Promise.all([
              supabase
                .from("expenses")
                .select("id, description, amount, currency, expense_date, created_at, group_id, paid_by, groups(name), payer:profiles!expenses_paid_by_fkey(display_name)")
                .in("group_id", groupIds)
                .order("created_at", { ascending: false })
                .limit(5),
              supabase
                .from("settlements")
                .select("id, amount, note, created_at, group_id, from_user, to_user, groups(name), from:profiles!settlements_from_user_fkey(display_name), to:profiles!settlements_to_user_fkey(display_name)")
                .in("group_id", groupIds)
                .order("created_at", { ascending: false })
                .limit(5)
            ]);

            const activities = [
              ...(recentExpensesRes.data ?? []).map((e: any) => ({
                id: e.id,
                type: "expense",
                description: e.description,
                amount: Number(e.amount),
                currency: e.currency || "USD",
                date: e.expense_date || e.created_at,
                groupName: e.groups?.name,
                groupId: e.group_id,
                payerName: e.payer?.display_name,
                paidBy: e.paid_by,
              })),
              ...(recentSettlementsRes.data ?? []).map((s: any) => ({
                id: s.id,
                type: "settlement",
                description: `${s.from?.display_name} paid ${s.to?.display_name}`,
                amount: Number(s.amount),
                currency: "USD",
                date: s.created_at,
                groupName: s.groups?.name,
                groupId: s.group_id,
                fromUser: s.from_user,
                toUser: s.to_user,
              })),
            ];

            activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setRecentActivity(activities.slice(0, 5));

            // 5. Generate historical trend data for the last 6 months
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const last6MonthsData = [];
            for (let i = 5; i >= 0; i--) {
              const d = new Date();
              d.setDate(1); // avoid end of month overflow
              d.setMonth(d.getMonth() - i);
              last6MonthsData.push({
                month: d.getMonth(),
                year: d.getFullYear(),
                label: monthNames[d.getMonth()],
                start: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(),
                end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).toISOString(),
                spend: 0,
                netChange: 0,
              });
            }
            setMonthsLabels(last6MonthsData.map(m => m.label));

            const rangeStart = last6MonthsData[0].start;
            const rangeEnd = last6MonthsData[5].end;

            const [rangeSplitsRes, rangePaidRes, rangeReceivedSettleRes, rangePaidSettleRes] = await Promise.all([
              supabase
                .from("expense_splits")
                .select("amount, expenses!inner(expense_date)")
                .eq("user_id", uuid)
                .in("expenses.group_id", groupIds)
                .gte("expenses.expense_date", rangeStart)
                .lte("expenses.expense_date", rangeEnd),
              supabase
                .from("expenses")
                .select("amount, expense_date")
                .eq("paid_by", uuid)
                .in("group_id", groupIds)
                .gte("expense_date", rangeStart)
                .lte("expense_date", rangeEnd),
              supabase
                .from("settlements")
                .select("amount, created_at")
                .eq("to_user", uuid)
                .in("group_id", groupIds)
                .gte("created_at", rangeStart)
                .lte("created_at", rangeEnd),
              supabase
                .from("settlements")
                .select("amount, created_at")
                .eq("from_user", uuid)
                .in("group_id", groupIds)
                .gte("created_at", rangeStart)
                .lte("created_at", rangeEnd),
            ]);

            for (const split of (rangeSplitsRes.data ?? []) as any[]) {
              const date = new Date(split.expenses?.expense_date);
              const mIdx = last6MonthsData.findIndex(m => m.month === date.getMonth() && m.year === date.getFullYear());
              if (mIdx !== -1) {
                last6MonthsData[mIdx].spend += Number(split.amount);
                last6MonthsData[mIdx].netChange -= Number(split.amount);
              }
            }

            for (const exp of rangePaidRes.data ?? []) {
              const date = new Date(exp.expense_date);
              const mIdx = last6MonthsData.findIndex(m => m.month === date.getMonth() && m.year === date.getFullYear());
              if (mIdx !== -1) {
                last6MonthsData[mIdx].netChange += Number(exp.amount);
              }
            }

            for (const settle of rangeReceivedSettleRes.data ?? []) {
              const date = new Date(settle.created_at);
              const mIdx = last6MonthsData.findIndex(m => m.month === date.getMonth() && m.year === date.getFullYear());
              if (mIdx !== -1) {
                last6MonthsData[mIdx].netChange += Number(settle.amount);
              }
            }

            for (const settle of rangePaidSettleRes.data ?? []) {
              const date = new Date(settle.created_at);
              const mIdx = last6MonthsData.findIndex(m => m.month === date.getMonth() && m.year === date.getFullYear());
              if (mIdx !== -1) {
                last6MonthsData[mIdx].netChange -= Number(settle.amount);
              }
            }

            setChartMonthlySpend(last6MonthsData.map(m => m.spend));
            setChartMonthlyNet(last6MonthsData.map(m => m.netChange));
          }
        } catch (e) {
          console.error("Dashboard data fetch failed:", e);
        } finally {
          setLoading(false);
        }
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
      value: totalBalance === 0 
        ? "$0.00" 
        : `${totalBalance > 0 ? "+" : "-"}$${Math.abs(totalBalance).toFixed(2)}`,
      label: "Total Balance",
      accent: "from-emerald-500/20 to-emerald-500/0",
      border: "border-emerald-500/20",
      text: totalBalance > 0 
        ? "text-emerald-400" 
        : totalBalance < 0 
        ? "text-rose-400" 
        : "text-slate-400",
    },
    {
      id: "stat-groups",
      icon: "👥",
      value: activeGroupsCount.toString(),
      label: "Active Groups",
      accent: "from-violet-500/20 to-violet-500/0",
      border: "border-violet-500/20",
      text: "text-violet-400",
    },
    {
      id: "stat-month",
      icon: "📊",
      value: `$${thisMonthSpending.toFixed(2)}`,
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

  // Helper calculations for the trend chart
  const getSvgCoordinates = (data: number[]) => {
    const minVal = Math.min(...data, 0);
    const maxVal = Math.max(...data, 100);
    const range = maxVal - minVal || 1;
    const minY = 30;
    const maxY = 170;
    
    return data.map((val, idx) => {
      const x = 50 + idx * 140;
      const y = maxY - ((val - minVal) / range) * (maxY - minY);
      return { x, y };
    });
  };

  const spendCoords = getSvgCoordinates(chartMonthlySpend);
  const netCoords = getSvgCoordinates(chartMonthlyNet);

  const spendPath = spendCoords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const spendArea = spendCoords.length > 0 ? `${spendPath} L 750 210 L 50 210 Z` : "";

  const netPath = netCoords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const netArea = netCoords.length > 0 ? `${netPath} L 750 210 L 50 210 Z` : "";

  const handleActionClick = (e: React.MouseEvent, actionId: string) => {
    if (actionId === "action-create-group") return;
    
    e.preventDefault();
    const type = actionId === "action-add-expense" 
      ? "expense" 
      : actionId === "action-settle" 
      ? "settle" 
      : "import";

    if (groups.length === 0) {
      alert("You need to create a group first to perform this action.");
      router.push("/groups");
    } else if (groups.length === 1) {
      const groupId = groups[0].id;
      if (type === "expense") router.push(`/groups/${groupId}/expenses/new`);
      else if (type === "settle") router.push(`/groups/${groupId}/settle`);
      else if (type === "import") router.push(`/groups/${groupId}/import`);
    } else {
      setModalActionType(type);
      setModalOpen(true);
    }
  };

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
              {monthsLabels.map((m, idx) => {
                const x = 50 + idx * 140;
                return (
                  <g key={`${m}-${idx}`}>
                    <line x1={x} y1="0" x2={x} y2="210" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                    <text x={x} y="218" fill="rgba(148,163,184,0.6)" fontSize="10" textAnchor="middle" fontFamily="Space Grotesk">
                      {m}
                    </text>
                  </g>
                );
              })}

              {/* Shared Expenses Area and Path */}
              {spendCoords.length > 0 && (
                <>
                  <path
                    d={spendPath}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    className="path-animated-1"
                  />
                  <path
                    d={spendArea}
                    fill="url(#shared-grad)"
                    className="opacity-70"
                  />
                </>
              )}

              {/* Net Balance Area and Path */}
              {netCoords.length > 0 && (
                <>
                  <path
                    d={netPath}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    className="path-animated-2"
                  />
                  <path
                    d={netArea}
                    fill="url(#balance-grad)"
                    className="opacity-70"
                  />
                </>
              )}

              {/* Interactive nodes/circles */}
              {/* Shared Expenses dots */}
              {spendCoords.map((c, idx) => (
                <circle key={`spend-${idx}`} cx={c.x} cy={c.y} r="4" fill="#030712" stroke="#f59e0b" strokeWidth="2.5" className="hover:scale-150 transition-all duration-300" />
              ))}

              {/* Net Balance dots */}
              {netCoords.map((c, idx) => (
                <circle key={`net-${idx}`} cx={c.x} cy={c.y} r="4" fill="#030712" stroke="#06b6d4" strokeWidth="2.5" className="hover:scale-150 transition-all duration-300" />
              ))}
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
                onClick={(e) => handleActionClick(e, a.id)}
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

          {recentActivity.length === 0 ? (
            /* Empty state */
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
          ) : (
            <div className="glass-card rounded-2xl divide-y divide-slate-800/50 overflow-hidden">
              {recentActivity.map((activity) => (
                <Link
                  key={activity.id}
                  href={`/groups/${activity.groupId}${
                    activity.type === "expense" ? `/expenses/${activity.id}` : "/settle"
                  }`}
                  className="flex items-center justify-between p-4 hover:bg-slate-800/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">
                      {activity.type === "expense" ? "💳" : "🤝"}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-200">
                        {activity.description}
                      </p>
                      <p className="text-xs text-slate-500">
                        {activity.groupName} · {new Date(activity.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-sm font-semibold ${
                        activity.type === "expense"
                          ? activity.paidBy === userUuid
                            ? "text-emerald-400"
                            : "text-slate-400"
                          : "text-emerald-400"
                      }`}
                    >
                      {activity.type === "expense" ? (
                        activity.paidBy === userUuid ? (
                          `You paid $${activity.amount.toFixed(2)}`
                        ) : (
                          `${activity.payerName} paid $${activity.amount.toFixed(2)}`
                        )
                      ) : (
                        `$${activity.amount.toFixed(2)}`
                      )}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ── Group Selector Modal ────────────────────────────── */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="glass-card w-full max-w-md p-6 rounded-2xl border border-slate-700/50 shadow-2xl relative">
              <button
                onClick={() => setModalOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
              <h3 className="text-xl font-display font-semibold text-white mb-2">
                Select Group
              </h3>
              <p className="text-sm text-slate-400 mb-6">
                Choose a group to {modalActionType === "expense" ? "add an expense to" : modalActionType === "settle" ? "settle up in" : "import CSV for"}:
              </p>
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      setModalOpen(false);
                      if (modalActionType === "expense") router.push(`/groups/${g.id}/expenses/new`);
                      else if (modalActionType === "settle") router.push(`/groups/${g.id}/settle`);
                      else if (modalActionType === "import") router.push(`/groups/${g.id}/import`);
                    }}
                    className="w-full text-left p-4 rounded-xl bg-slate-800/30 hover:bg-slate-800/60 border border-slate-700/25 hover:border-amber-500/30 transition-all flex items-center justify-between group"
                  >
                    <span className="font-medium text-slate-200 group-hover:text-white transition-colors">
                      {g.name}
                    </span>
                    <span className="text-slate-500 group-hover:text-amber-400 transition-colors">
                      →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer spacer ──────────────────────────────── */}
        <div className="h-8" />
      </main>
    </div>
  );
}

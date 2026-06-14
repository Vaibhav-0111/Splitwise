"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function NavBar({ userName }: { userName?: string }) {
  const router = useRouter();

  async function handleSignOut() {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign out error:", error);
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="glass-strong sticky top-0 z-50 border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-xl font-bold font-display gradient-text-static hover-scale inline-block"
        >
          Splitsy
        </Link>
        <div className="flex items-center gap-5">
          {userName && (
            <span className="text-sm text-slate-400 hidden sm:inline">
              Hi, <span className="text-slate-200 font-medium">{userName}</span>
            </span>
          )}
          <Link
            href="/dashboard"
            className="text-sm text-slate-400 hover:text-primary transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/groups"
            className="text-sm text-slate-400 hover:text-primary transition-colors"
          >
            Groups
          </Link>
          <button
            onClick={handleSignOut}
            className="text-sm text-slate-500 hover:text-slate-200 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}

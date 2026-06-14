"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createClient, deterministicUuid } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const setAuthCookies = (uid: string, emailStr: string | null, displayName: string | null) => {
    const maxAge = 60 * 60 * 24 * 7;
    document.cookie = `firebase_uid=${encodeURIComponent(uid)}; path=/; max-age=${maxAge}; samesite=lax`;
    document.cookie = `firebase_email=${encodeURIComponent(emailStr ?? "")}; path=/; max-age=${maxAge}; samesite=lax`;
    document.cookie = `firebase_display_name=${encodeURIComponent(displayName ?? "")}; path=/; max-age=${maxAge}; samesite=lax`;
  };

  const syncSupabaseProfile = async (uid: string, emailStr: string | null, displayName: string | null) => {
    try {
      const uuid = deterministicUuid(uid);
      const supabase = await createClient();
      
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", uuid)
        .maybeSingle();

      if (!existingProfile) {
        await supabase.from("profiles").insert({
          id: uuid,
          email: emailStr ?? "",
          display_name: displayName || emailStr?.split("@")[0] || "User",
          created_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("Failed to sync profile to Supabase:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const user = result.user;
      setAuthCookies(user.uid, user.email, user.displayName);
      await syncSupabaseProfile(user.uid, user.email, user.displayName);
      
      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 300);
    } catch (err: any) {
      setError(err.message || "Failed to sign in");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const user = result.user;
      setAuthCookies(user.uid, user.email, user.displayName);
      await syncSupabaseProfile(user.uid, user.email, user.displayName);

      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 300);
    } catch (err: any) {
      setError(err.message || "Failed to sign in with Google");
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Morphing blobs */}
      <div className="blob blob-primary w-[420px] h-[420px] -top-32 -left-32" />
      <div className="blob blob-accent w-[360px] h-[360px] -bottom-24 -right-24" />

      {/* Grid overlay */}
      <div className="hero-grid absolute inset-0 pointer-events-none" />

      {/* Login Card */}
      <div
        className={`auth-card max-w-md w-full p-8 sm:p-10 relative z-10 ${
          mounted ? "animate-card-reveal" : "opacity-0"
        } ${success ? "scale-[0.97] opacity-80 transition-all duration-500" : ""}`}
      >
        {/* Logo */}
        <div className="text-center mb-2 animate-stagger" style={{ animationDelay: "0ms" }}>
          <h1 className="gradient-text-static text-4xl font-display font-bold tracking-tight">
            Splitsy
          </h1>
        </div>

        {/* Subtitle */}
        <p
          className="text-center text-slate-400 mb-8 animate-stagger"
          style={{ animationDelay: "100ms" }}
        >
          Welcome back 👋
        </p>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm rounded-xl px-4 py-3 mb-6 text-center">
            ✨ Welcome back! Redirecting…
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
          <div className="animate-stagger" style={{ animationDelay: "200ms" }}>
            <label htmlFor="login-email" className="block text-sm text-slate-300 mb-1.5 font-medium">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              className="input w-full"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div className="animate-stagger" style={{ animationDelay: "300ms" }}>
            <label htmlFor="login-password" className="block text-sm text-slate-300 mb-1.5 font-medium">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className="input w-full"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {/* Submit */}
          <div className="animate-stagger" style={{ animationDelay: "400ms" }}>
            <button
              id="login-submit"
              type="submit"
              className="btn-primary w-full flex items-center justify-center gap-2"
              disabled={loading}
            >
              {loading && !success ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : success ? (
                "Welcome! ✨"
              ) : (
                "Sign in"
              )}
            </button>
          </div>
        </form>

        {/* Divider */}
        <div
          className="flex items-center gap-3 my-7 animate-stagger"
          style={{ animationDelay: "500ms" }}
        >
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-slate-500 uppercase tracking-wider">Or continue with</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Google */}
        <div className="animate-stagger" style={{ animationDelay: "600ms" }}>
          <button
            id="login-google"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl
              bg-white/5 border border-white/10 text-slate-200 font-medium
              hover:bg-white/10 hover:border-white/20 hover-glow
              transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="20" height="20" viewBox="0 0 48 48" className="shrink-0">
              <path fill="#4285F4" d="M44.5 24.3c0-1.6-.1-3.1-.4-4.6H24v9.1h11.5c-.5 2.6-2 4.8-4.2 6.3v5.2h6.8c4-3.7 6.4-9.1 6.4-16z" />
              <path fill="#34A853" d="M24 48c5.7 0 10.5-1.9 14-5.2l-6.8-5.2c-1.9 1.3-4.3 2-7.2 2-5.5 0-10.2-3.7-11.8-8.7H5.1v5.4C8.6 42.8 15.7 48 24 48z" />
              <path fill="#FBBC05" d="M12.2 28.9c-.9-2.6-.9-5.4 0-8l-7.1-5.4C2.2 20.7.9 25.2 2.2 29.5l10-0.6z" />
              <path fill="#EA4335" d="M24 9.5c3.1 0 5.8 1.1 8 3.1l6-6C34.5 3.1 29.7 1 24 1 15.7 1 8.6 6.2 5.1 13.5l7.1 5.4C13.8 13.3 18.5 9.5 24 9.5z" />
            </svg>
            Continue with Google
          </button>
        </div>

        {/* Footer */}
        <p
          className="text-center text-sm text-slate-500 mt-8 animate-stagger"
          style={{ animationDelay: "700ms" }}
        >
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createClient, deterministicUuid } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      
      setAuthCookies(cred.user.uid, cred.user.email, name);
      await syncSupabaseProfile(cred.user.uid, cred.user.email, name);

      setInfo("Account created! Redirecting…");
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 300);
    } catch (err: any) {
      setError(err.message?.replace("Firebase: ", "") ?? "Something went wrong");
      setLoading(false);
    }
  }

  async function handleGoogleSignUp() {
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      setAuthCookies(user.uid, user.email, user.displayName);
      await syncSupabaseProfile(user.uid, user.email, user.displayName);

      setInfo("Signing in with Google...");
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 300);
    } catch (err: any) {
      setError(err.message?.replace("Firebase: ", "") ?? "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="auth-bg min-h-screen relative flex items-center justify-center px-4 overflow-hidden">
      {/* ── Morphing background blobs ── */}
      <div
        className="blob blob-accent w-[420px] h-[420px] -top-24 -right-32 opacity-60"
        style={{ animationDelay: "0s" }}
      />
      <div
        className="blob blob-neon w-[350px] h-[350px] -bottom-20 -left-28 opacity-50"
        style={{ animationDelay: "4s" }}
      />

      {/* ── Subtle grid overlay ── */}
      <div className="hero-grid absolute inset-0 pointer-events-none" />

      {/* ── Auth card ── */}
      <div
        className={`auth-card w-full max-w-md p-8 sm:p-10 relative z-10 transition-all duration-700 ${
          mounted ? "animate-card-reveal" : "opacity-0"
        }`}
      >
        {/* Logo */}
        <div
          className="text-center mb-2 animate-stagger"
          style={{ animationDelay: "100ms" }}
        >
          <h1 className="gradient-text-static text-4xl font-display font-bold tracking-tight">
            Splitsy
          </h1>
        </div>

        {/* Subtitle */}
        <p
          className="text-center text-slate-400 text-sm mb-8 animate-stagger"
          style={{ animationDelay: "200ms" }}
        >
          Create your account 🚀
        </p>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3 mb-5 animate-stagger">
            {error}
          </div>
        )}

        {/* Info */}
        {info && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl px-4 py-3 mb-5 animate-stagger">
            {info}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div
            className="animate-stagger"
            style={{ animationDelay: "300ms" }}
          >
            <label
              htmlFor="signup-name"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Full Name
            </label>
            <input
              id="signup-name"
              type="text"
              required
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>

          {/* Email */}
          <div
            className="animate-stagger"
            style={{ animationDelay: "400ms" }}
          >
            <label
              htmlFor="signup-email"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          {/* Password */}
          <div
            className="animate-stagger"
            style={{ animationDelay: "500ms" }}
          >
            <label
              htmlFor="signup-password"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
            />
          </div>

          {/* Submit */}
          <div
            className="animate-stagger"
            style={{ animationDelay: "600ms" }}
          >
            <button
              id="signup-submit"
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </div>
        </form>

        {/* Divider */}
        <div
          className="relative my-6 animate-stagger"
          style={{ animationDelay: "700ms" }}
        >
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/[0.06]" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-3 bg-transparent text-slate-500 backdrop-blur-sm">
              Or continue with
            </span>
          </div>
        </div>

        {/* Google */}
        <div
          className="animate-stagger"
          style={{ animationDelay: "800ms" }}
        >
          <button
            id="signup-google"
            type="button"
            onClick={handleGoogleSignUp}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 border border-white/[0.08] rounded-xl hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300 group"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
              Sign up with Google
            </span>
          </button>
        </div>

        {/* Footer link */}
        <p
          className="text-sm text-center text-slate-500 mt-6 animate-stagger"
          style={{ animationDelay: "900ms" }}
        >
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-amber-400 font-medium hover:text-amber-300 hover:underline transition-colors"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

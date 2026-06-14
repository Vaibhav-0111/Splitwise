"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

import { createClient, deterministicUuid } from "@/lib/supabase/client";

// Pages that don't require authentication
const PUBLIC_PAGES = ["/", "/login", "/signup"];

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGES.some(
    (page) => pathname === page || pathname.startsWith(page + "/")
  );
}

function isAuthPage(pathname: string): boolean {
  return pathname.startsWith("/login") || pathname.startsWith("/signup");
}

export default function FirebaseSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Set cookies for middleware
        const maxAge = 60 * 60 * 24 * 7;
        document.cookie = `firebase_uid=${encodeURIComponent(user.uid)}; path=/; max-age=${maxAge}; samesite=lax`;
        document.cookie = `firebase_email=${encodeURIComponent(user.email ?? "")}; path=/; max-age=${maxAge}; samesite=lax`;
        document.cookie = `firebase_display_name=${encodeURIComponent(user.displayName ?? "")}; path=/; max-age=${maxAge}; samesite=lax`;

        // Background profile sync
        const syncProfile = async () => {
          try {
            const uuid = deterministicUuid(user.uid);
            const supabase = createClient();
            const { data: existingProfile } = await supabase
              .from("profiles")
              .select("id")
              .eq("id", uuid)
              .maybeSingle();

            if (!existingProfile) {
              await supabase.from("profiles").insert({
                id: uuid,
                email: user.email ?? "",
                display_name: user.displayName || user.email?.split("@")[0] || "User",
                created_at: new Date().toISOString(),
              });
            }
          } catch (e) {
            console.error("Self-healing profile sync failed:", e);
          }
        };
        syncProfile();
      } else {
        // Clear cookies
        document.cookie = "firebase_uid=; path=/; max-age=0; samesite=lax";
        document.cookie = "firebase_email=; path=/; max-age=0; samesite=lax";
        document.cookie = "firebase_display_name=; path=/; max-age=0; samesite=lax";
      }

      if (user) {
        // Authenticated user on auth page → redirect to dashboard
        if (isAuthPage(pathname)) {
          window.location.replace("/dashboard");
        }
      } else {
        // Unauthenticated user on protected page → redirect to login
        if (!isPublicPage(pathname)) {
          window.location.replace("/login");
        }
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [pathname]);

  // Show premium loading state for protected pages while checking auth
  if (isLoading && !isPublicPage(pathname)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mesh">
        <div className="text-center animate-fade-up">
          <div className="relative mx-auto mb-6">
            <div className="spinner mx-auto"></div>
            <div className="absolute inset-0 spinner mx-auto opacity-30 scale-110" style={{ animationDelay: '150ms' }}></div>
          </div>
          <p className="text-lg font-display gradient-text-static font-semibold">Splitsy</p>
          <p className="text-sm text-slate-500 mt-1">Loading your experience...</p>
        </div>
      </div>
    );
  }

  return children;
}

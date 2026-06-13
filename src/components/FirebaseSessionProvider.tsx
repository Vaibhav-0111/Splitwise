"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function FirebaseSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/signup");

      if (user) {
        const maxAge = 60 * 60 * 24 * 7;
        document.cookie = `firebase_uid=${encodeURIComponent(user.uid)}; path=/; max-age=${maxAge}; samesite=lax`;
        document.cookie = `firebase_email=${encodeURIComponent(user.email ?? "")}; path=/; max-age=${maxAge}; samesite=lax`;
        document.cookie = `firebase_display_name=${encodeURIComponent(user.displayName ?? "")}; path=/; max-age=${maxAge}; samesite=lax`;
      } else {
        document.cookie = "firebase_uid=; path=/; max-age=0; samesite=lax";
        document.cookie = "firebase_email=; path=/; max-age=0; samesite=lax";
        document.cookie = "firebase_display_name=; path=/; max-age=0; samesite=lax";
      }

      if (user) {
        // User is logged in
        if (isAuthPage) {
          router.push("/groups");
        }
      } else {
        // User is not logged in
        if (!isAuthPage) {
          router.push("/login");
        }
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [pathname, router]);

  // Show loading state while checking auth
  if (isLoading && !pathname.startsWith("/login") && !pathname.startsWith("/signup")) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return children;
}

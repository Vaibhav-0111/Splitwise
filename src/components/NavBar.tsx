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
    <nav className="bg-surface border-b border-border sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/groups" className="text-xl font-bold text-primary">
          Splitsy
        </Link>
        <div className="flex items-center gap-4">
          {userName && <span className="text-sm text-muted-foreground">Hi, {userName}</span>}
          <button onClick={handleSignOut} className="text-sm text-muted-foreground hover:text-foreground">
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}

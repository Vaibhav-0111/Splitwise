"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NavBar({ userName }: { userName?: string }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
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

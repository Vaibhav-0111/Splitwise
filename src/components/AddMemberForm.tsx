"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default async function AddMemberForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  const supabase = await createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Look up the user by email
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.trim().toLowerCase())
      .single();

    if (profileError || !profile) {
      setError("No Splitsy user found with that email. They need to sign up first.");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("group_members")
      .insert({ group_id: groupId, user_id: profile.id, role: "member" });

    setLoading(false);

    if (insertError) {
      if (insertError.code === "23505") {
        setError("This user is already in the group.");
      } else {
        setError(insertError.message);
      }
      return;
    }

    setEmail("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary text-sm">
        + Add member
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 items-start mt-2">
      <div className="flex-1 w-full">
        <input
          autoFocus
          type="email"
          required
          className="input"
          placeholder="friend@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && <p className="text-destructive text-sm mt-1">{error}</p>}
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn-primary text-sm">
          {loading ? "Adding..." : "Add"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

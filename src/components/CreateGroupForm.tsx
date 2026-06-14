"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CreateGroupForm({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);

    // 1. Create the group
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .insert({ name: name.trim(), created_by: userId })
      .select()
      .single();

    if (groupError || !group) {
      setError(groupError?.message ?? "Failed to create group");
      setLoading(false);
      return;
    }

    // 2. Add creator as owner member
    const { error: memberError } = await supabase
      .from("group_members")
      .insert({ group_id: group.id, user_id: userId, role: "owner" });

    setLoading(false);

    if (memberError) {
      setError(memberError.message);
      return;
    }

    setName("");
    setOpen(false);
    router.push(`/groups/${group.id}`);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary">
        + New group
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col sm:flex-row gap-2 items-start">
      <div className="flex-1 w-full">
        <input
          autoFocus
          className="input"
          placeholder="e.g. Goa Trip, Apartment 4B"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error && <p className="text-destructive text-sm mt-1">{error}</p>}
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Creating..." : "Create"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}

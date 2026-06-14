"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Member = { id: string; display_name: string };

export default async function SettleUpForm({
  groupId,
  members,
  currentUserId,
}: {
  groupId: string;
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const supabase = await createClient();

  const [fromUser, setFromUser] = useState(currentUserId);
  const [toUser, setToUser] = useState(
    members.find((m) => m.id !== currentUserId)?.id ?? ""
  );
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return setError("Enter a valid amount.");
    if (fromUser === toUser) return setError("Payer and recipient must be different.");

    setLoading(true);

    const { error } = await supabase.from("settlements").insert({
      group_id: groupId,
      from_user: fromUser,
      to_user: toUser,
      amount: amt,
      note: note.trim() || null,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push(`/groups/${groupId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      {error && <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">From (payer)</label>
          <select className="input" value={fromUser} onChange={(e) => setFromUser(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === currentUserId ? `${m.display_name} (you)` : m.display_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">To (recipient)</label>
          <select className="input" value={toUser} onChange={(e) => setToUser(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === currentUserId ? `${m.display_name} (you)` : m.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Amount (USD)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          className="input"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Note (optional)</label>
        <input
          className="input"
          placeholder="e.g. Paid via Venmo"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Recording..." : "Record payment"}
      </button>
    </form>
  );
}

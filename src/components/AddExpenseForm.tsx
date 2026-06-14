"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SplitType } from "@/lib/types";

type Member = { id: string; display_name: string };

export default function AddExpenseForm({
  groupId,
  currentUserId,
  members,
}: {
  groupId: string;
  currentUserId: string;
  members: Member[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [participants, setParticipants] = useState<Set<string>>(
    new Set(members.map((m) => m.id))
  );
  // For unequal: dollar amounts. For percentage: percentages. For shares: share counts.
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const totalAmount = parseFloat(amount) || 0;
  const activeMembers = members.filter((m) => participants.has(m.id));

  function toggleParticipant(id: string) {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Live preview of how the expense will be split
  const preview = useMemo(() => {
    if (activeMembers.length === 0 || totalAmount <= 0) return [];

    if (splitType === "equal") {
      const share = totalAmount / activeMembers.length;
      return activeMembers.map((m) => ({ id: m.id, name: m.display_name, amount: share }));
    }

    if (splitType === "unequal") {
      return activeMembers.map((m) => ({
        id: m.id,
        name: m.display_name,
        amount: parseFloat(values[m.id] || "0") || 0,
      }));
    }

    if (splitType === "percentage") {
      return activeMembers.map((m) => {
        const pct = parseFloat(values[m.id] || "0") || 0;
        return { id: m.id, name: m.display_name, amount: (totalAmount * pct) / 100, pct };
      });
    }

    // shares
    const totalShares = activeMembers.reduce(
      (sum, m) => sum + (parseFloat(values[m.id] || "0") || 0),
      0
    );
    if (totalShares === 0) return activeMembers.map((m) => ({ id: m.id, name: m.display_name, amount: 0 }));
    return activeMembers.map((m) => {
      const shares = parseFloat(values[m.id] || "0") || 0;
      return { id: m.id, name: m.display_name, amount: (totalAmount * shares) / totalShares, shares };
    });
  }, [activeMembers, totalAmount, splitType, values]);

  const previewSum = preview.reduce((s, p) => s + p.amount, 0);
  const sumOfInputs =
    splitType === "unequal"
      ? activeMembers.reduce((s, m) => s + (parseFloat(values[m.id] || "0") || 0), 0)
      : splitType === "percentage"
      ? activeMembers.reduce((s, m) => s + (parseFloat(values[m.id] || "0") || 0), 0)
      : 0;

  function buildFinalSplits(): { user_id: string; amount: number; percentage: number | null; shares: number | null }[] {
    // Round each computed amount to 2 decimals, then fix rounding drift
    // on the last participant so the total matches exactly.
    const rounded = preview.map((p) => ({
      user_id: p.id,
      amount: Math.round(p.amount * 100) / 100,
      percentage: splitType === "percentage" ? (p as any).pct ?? null : null,
      shares: splitType === "shares" ? (p as any).shares ?? null : null,
    }));

    const sum = rounded.reduce((s, r) => s + r.amount, 0);
    const drift = Math.round((totalAmount - sum) * 100) / 100;
    if (drift !== 0 && rounded.length > 0) {
      rounded[rounded.length - 1].amount = Math.round((rounded[rounded.length - 1].amount + drift) * 100) / 100;
    }
    return rounded;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!description.trim()) return setError("Description is required.");
    if (totalAmount <= 0) return setError("Amount must be greater than 0.");
    if (activeMembers.length === 0) return setError("Select at least one participant.");

    if (splitType === "unequal" && Math.abs(sumOfInputs - totalAmount) > 0.01) {
      return setError(
        `Split amounts ($${sumOfInputs.toFixed(2)}) must add up to the total ($${totalAmount.toFixed(2)}).`
      );
    }
    if (splitType === "percentage" && Math.abs(sumOfInputs - 100) > 0.01) {
      return setError(`Percentages must add up to 100% (currently ${sumOfInputs.toFixed(1)}%).`);
    }
    if (splitType === "shares") {
      const totalShares = activeMembers.reduce((s, m) => s + (parseFloat(values[m.id] || "0") || 0), 0);
      if (totalShares <= 0) return setError("Enter at least one share.");
    }

    setLoading(true);

    const splits = buildFinalSplits();

    const { error: rpcError } = await supabase.rpc("create_expense_with_splits", {
      p_group_id: groupId,
      p_description: description.trim(),
      p_amount: totalAmount,
      p_currency: "USD",
      p_paid_by: paidBy,
      p_split_type: splitType,
      p_splits: splits,
    });

    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    router.push(`/groups/${groupId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      {error && <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-3 py-2">{error}</div>}

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Description</label>
        <input
          className="input"
          placeholder="e.g. Dinner at Olive Garden"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
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
          <label className="block text-sm font-medium text-foreground mb-1">Paid by</label>
          <select className="input" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === currentUserId ? `${m.display_name} (you)` : m.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Split type</label>
        <div className="flex gap-2 flex-wrap">
          {(["equal", "unequal", "percentage", "shares"] as SplitType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSplitType(t)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                splitType === t
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface text-foreground border-border"
              }`}
            >
              {t === "equal" && "Equally"}
              {t === "unequal" && "Unequally"}
              {t === "percentage" && "By percentage"}
              {t === "shares" && "By shares"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Split between
          {splitType === "percentage" && (
            <span className="text-muted-foreground font-normal"> — enter % for each</span>
          )}
          {splitType === "unequal" && (
            <span className="text-muted-foreground font-normal"> — enter $ for each</span>
          )}
          {splitType === "shares" && (
            <span className="text-muted-foreground font-normal"> — enter share count for each</span>
          )}
        </label>
        <div className="space-y-2">
          {members.map((m) => {
            const isActive = participants.has(m.id);
            const previewRow = preview.find((p) => p.id === m.id);
            return (
              <div key={m.id} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={() => toggleParticipant(m.id)}
                  className="h-4 w-4"
                />
                <span className="flex-1 text-sm">
                  {m.id === currentUserId ? `${m.display_name} (you)` : m.display_name}
                </span>

                {isActive && splitType !== "equal" && (
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input w-24 text-right"
                    placeholder={splitType === "shares" ? "1" : "0"}
                    value={values[m.id] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [m.id]: e.target.value }))
                    }
                  />
                )}

                {isActive && (
                  <span className="text-sm text-muted-foreground w-20 text-right">
                    {previewRow ? `$${previewRow.amount.toFixed(2)}` : "$0.00"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {splitType === "unequal" && (
          <p className="text-xs text-muted-foreground mt-1">
            Entered: ${sumOfInputs.toFixed(2)} / Total: ${totalAmount.toFixed(2)}
          </p>
        )}
        {splitType === "percentage" && (
          <p className="text-xs text-muted-foreground mt-1">Entered: {sumOfInputs.toFixed(1)}% / 100%</p>
        )}
        {previewSum > 0 && (
          <p className="text-xs text-muted-foreground mt-1">Split total: ${previewSum.toFixed(2)}</p>
        )}
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Saving..." : "Save expense"}
      </button>
    </form>
  );
}

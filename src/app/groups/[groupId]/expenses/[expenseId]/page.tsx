import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";
import ExpenseChat from "@/components/ExpenseChat";
import DeleteExpenseButton from "@/components/DeleteExpenseButton";

export default async function ExpenseDetailPage({
  params,
}: {
  params: { groupId: string; expenseId: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name")
    .eq("id", params.groupId)
    .single();
  if (!group) notFound();

  const { data: expense } = await supabase
    .from("expenses")
    .select(
      "id, description, amount, currency, split_type, created_at, created_by, paid_by, payer:profiles!expenses_paid_by_fkey(display_name)"
    )
    .eq("id", params.expenseId)
    .single();
  if (!expense) notFound();

  const { data: splits } = await supabase
    .from("expense_splits")
    .select("user_id, amount, percentage, shares, profiles(display_name)")
    .eq("expense_id", expense.id);

  const { data: messages } = await supabase
    .from("expense_messages")
    .select("id, expense_id, user_id, message, created_at, profiles(id, display_name, email, avatar_url)")
    .eq("expense_id", expense.id)
    .order("created_at", { ascending: true });

  const splitTypeLabel: Record<string, string> = {
    equal: "Split equally",
    unequal: "Split unequally",
    percentage: "Split by percentage",
    shares: "Split by shares",
  };

  return (
    <div>
      <NavBar userName={profile?.display_name} />
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <Link href={`/groups/${group.id}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to {group.name}
        </Link>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="card">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold">{expense.description}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Paid by <strong>{(expense as any).payer?.display_name}</strong> ·{" "}
                  {new Date(expense.created_at).toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">{splitTypeLabel[expense.split_type]}</p>
              </div>
              <p className="text-2xl font-bold text-primary">
                {expense.currency} {Number(expense.amount).toFixed(2)}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-border">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Breakdown</h3>
              <ul className="space-y-1 text-sm">
                {splits?.map((s: any) => (
                  <li key={s.user_id} className="flex items-center justify-between">
                    <span>
                      {s.profiles?.display_name}
                      {expense.split_type === "percentage" && s.percentage != null && (
                        <span className="text-muted-foreground"> ({Number(s.percentage).toFixed(1)}%)</span>
                      )}
                      {expense.split_type === "shares" && s.shares != null && (
                        <span className="text-muted-foreground"> ({Number(s.shares)} shares)</span>
                      )}
                    </span>
                    <span>${Number(s.amount).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {expense.created_by === user.id && (
              <div className="mt-4 pt-3 border-t border-border">
                <DeleteExpenseButton expenseId={expense.id} groupId={group.id} />
              </div>
            )}
          </div>

          <ExpenseChat
            expenseId={expense.id}
            currentUserId={user.id}
            initialMessages={(messages ?? []) as any}
          />
        </div>
      </main>
    </div>
  );
}

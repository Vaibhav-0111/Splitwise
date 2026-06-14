import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";
import AddMemberForm from "@/components/AddMemberForm";
import RemoveMemberButton from "@/components/RemoveMemberButton";

export default async function GroupPage({ params }: { params: { groupId: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, created_by")
    .eq("id", params.groupId)
    .single();

  if (!group) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, role, profiles(id, display_name, email)")
    .eq("group_id", group.id);

  const { data: expenses } = await supabase
    .from("expenses")
    .select("id, description, amount, currency, expense_date, created_at, paid_by, payer:profiles!expenses_paid_by_fkey(display_name)")
    .eq("group_id", group.id)
    .order("expense_date", { ascending: false });

  const { data: balances } = await supabase.rpc("get_group_balances", {
    p_group_id: group.id,
  });

  const { data: pairwise } = await supabase.rpc("get_group_pairwise_balances", {
    p_group_id: group.id,
  });

  const myMembership = members?.find((m: any) => m.user_id === user.id);
  const isOwner = myMembership?.role === "owner";

  return (
    <div>
      <NavBar userName={profile?.display_name} />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <Link href="/groups" className="text-sm text-muted-foreground hover:underline">
              ← All groups
            </Link>
            <h1 className="text-2xl font-bold">{group.name}</h1>
          </div>
          <div className="flex gap-2">
            <Link href={`/groups/${group.id}/expenses/new`} className="btn-primary">
              + Add expense
            </Link>
            <Link href={`/groups/${group.id}/import`} className="btn-secondary">
              Import CSV
            </Link>
            <Link href={`/groups/${group.id}/settle`} className="btn-secondary">
              Settle up
            </Link>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          {/* Members */}
          <div className="card sm:col-span-1">
            <h2 className="font-semibold mb-2">Members ({members?.length ?? 0})</h2>
            <ul className="space-y-2">
              {members?.map((m: any) => (
                <li key={m.user_id} className="flex items-center justify-between text-sm">
                  <span>
                    {m.profiles?.display_name}
                    {m.user_id === user.id && <span className="text-muted-foreground"> (you)</span>}
                    {m.role === "owner" && (
                      <span className="ml-1 text-xs text-primary">★ owner</span>
                    )}
                  </span>
                  {isOwner && m.user_id !== user.id && (
                    <RemoveMemberButton groupId={group.id} userId={m.user_id} />
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <AddMemberForm groupId={group.id} />
            </div>
          </div>

          {/* Balances */}
          <div className="card sm:col-span-2">
            <h2 className="font-semibold mb-2">Balances</h2>
            {(!pairwise || pairwise.length === 0) ? (
              <p className="text-sm text-muted-foreground">Everyone is settled up. 🎉</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {pairwise.map((p: any, i: number) => (
                  <li key={i} className="flex items-center justify-between">
                    <span>
                      <strong>{p.debtor_name}</strong> owes{" "}
                      <strong>{p.creditor_name}</strong>
                    </span>
                    <span className="font-semibold text-primary">
                      ${Number(p.amount).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 pt-3 border-t border-border">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                Net balances
              </h3>
              <ul className="space-y-1 text-sm">
                {balances?.map((b: any) => (
                  <li key={b.user_id} className="flex items-center justify-between">
                    <span>{b.display_name}</span>
                    <span
                      className={
                        Number(b.net_balance) > 0
                          ? "text-success"
                          : Number(b.net_balance) < 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }
                    >
                      {Number(b.net_balance) === 0
                        ? "settled"
                        : `${Number(b.net_balance) > 0 ? "+" : ""}$${Number(
                            b.net_balance
                          ).toFixed(2)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Expenses */}
        <div className="card">
          <h2 className="font-semibold mb-2">Expenses</h2>
          {(!expenses || expenses.length === 0) ? (
            <p className="text-sm text-muted-foreground">No expenses yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {expenses.map((e: any) => (
                <li key={e.id}>
                  <Link
                    href={`/groups/${group.id}/expenses/${e.id}`}
                    className="flex items-center justify-between py-3 hover:bg-muted -mx-4 px-4 rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{e.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Paid by {e.payer?.display_name} ·{" "}
                        {new Date(e.expense_date).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="font-semibold">
                      {e.currency} {Number(e.amount).toFixed(2)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

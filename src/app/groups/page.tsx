import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";
import CreateGroupForm from "@/components/CreateGroupForm";

export default async function GroupsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  // Fetch groups the user belongs to, plus net balance for each
  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, groups(id, name, created_at)")
    .eq("user_id", user.id);

  const groups = (memberships ?? [])
    .map((m: any) => m.groups)
    .filter(Boolean)
    .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1));

  // Get this user's net balance per group via batched queries (avoids an
  // N+1 RPC call per group — see AI_USAGE.md case 3).
  const groupIds = groups.map((g: any) => g.id);
  const balances: Record<string, number> = {};

  if (groupIds.length > 0) {
    for (const id of groupIds) balances[id] = 0;

    const [paidRes, owedRes, receivedRes, paidSettleRes] = await Promise.all([
      supabase.from("expenses").select("group_id, amount").eq("paid_by", user.id).in("group_id", groupIds),
      supabase
        .from("expense_splits")
        .select("amount, expenses!inner(group_id)")
        .eq("user_id", user.id)
        .in("expenses.group_id", groupIds),
      supabase.from("settlements").select("group_id, amount").eq("to_user", user.id).in("group_id", groupIds),
      supabase.from("settlements").select("group_id, amount").eq("from_user", user.id).in("group_id", groupIds),
    ]);

    for (const row of paidRes.data ?? []) balances[row.group_id] += Number(row.amount);
    for (const row of (owedRes.data ?? []) as any[]) {
      const gid = row.expenses?.group_id;
      if (gid) balances[gid] -= Number(row.amount);
    }
    for (const row of receivedRes.data ?? []) balances[row.group_id] += Number(row.amount);
    for (const row of paidSettleRes.data ?? []) balances[row.group_id] -= Number(row.amount);
  }

  return (
    <div>
      <NavBar userName={profile?.display_name} />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Your groups</h1>
          <CreateGroupForm userId={user.id} />
        </div>

        {groups.length === 0 ? (
          <div className="card text-center text-muted-foreground py-12">
            You're not part of any groups yet. Create one to get started!
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {groups.map((g: any) => {
              const bal = balances[g.id] ?? 0;
              return (
                <Link
                  key={g.id}
                  href={`/groups/${g.id}`}
                  className="card hover:shadow-md transition-shadow flex items-center justify-between"
                >
                  <div>
                    <h2 className="font-semibold text-lg">{g.name}</h2>
                    {bal === 0 ? (
                      <p className="text-sm text-muted-foreground mt-1">You're all settled up</p>
                    ) : bal > 0 ? (
                      <p className="text-sm text-success mt-1">
                        You are owed ${bal.toFixed(2)}
                      </p>
                    ) : (
                      <p className="text-sm text-destructive mt-1">
                        You owe ${Math.abs(bal).toFixed(2)}
                      </p>
                    )}
                  </div>
                  <span className="text-muted-foreground">→</span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

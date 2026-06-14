import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";
import SettleUpForm from "@/components/SettleUpForm";

export default async function SettlePage({ params }: { params: { groupId: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select("id, name")
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
    .select("user_id, profiles(id, display_name)")
    .eq("group_id", group.id);

  const memberList = (members ?? []).map((m: any) => ({
    id: m.user_id,
    display_name: m.profiles?.display_name ?? "Unknown",
  }));

  const { data: pairwise } = await supabase.rpc("get_group_pairwise_balances", {
    p_group_id: group.id,
  });

  const { data: settlements } = await supabase
    .from("settlements")
    .select("id, amount, note, created_at, from_user, to_user, from:profiles!settlements_from_user_fkey(display_name), to:profiles!settlements_to_user_fkey(display_name)")
    .eq("group_id", group.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <NavBar userName={profile?.display_name} />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <Link href={`/groups/${group.id}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to {group.name}
        </Link>
        <h1 className="text-2xl font-bold">Settle up</h1>

        {pairwise && pairwise.length > 0 && (
          <div className="card">
            <h2 className="font-semibold mb-2 text-sm text-muted-foreground uppercase">Outstanding balances</h2>
            <ul className="space-y-1 text-sm">
              {pairwise.map((p: any, i: number) => (
                <li key={i} className="flex items-center justify-between">
                  <span>
                    <strong>{p.debtor_name}</strong> owes <strong>{p.creditor_name}</strong>
                  </span>
                  <span className="font-semibold">${Number(p.amount).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <SettleUpForm groupId={group.id} members={memberList} currentUserId={user.id} />

        {settlements && settlements.length > 0 && (
          <div className="card">
            <h2 className="font-semibold mb-2 text-sm text-muted-foreground uppercase">Payment history</h2>
            <ul className="space-y-2 text-sm divide-y divide-border">
              {settlements.map((s: any) => (
                <li key={s.id} className="pt-2 first:pt-0 flex items-center justify-between">
                  <span>
                    <strong>{s.from?.display_name}</strong> paid{" "}
                    <strong>{s.to?.display_name}</strong>
                    {s.note && <span className="text-muted-foreground"> — {s.note}</span>}
                    <br />
                    <span className="text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleString()}
                    </span>
                  </span>
                  <span className="font-semibold">${Number(s.amount).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

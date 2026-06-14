import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";
import AddExpenseForm from "@/components/AddExpenseForm";

export default async function NewExpensePage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select("id, name")
    .eq("id", groupId)
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

  return (
    <div>
      <NavBar userName={profile?.display_name} />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <Link href={`/groups/${group.id}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to {group.name}
        </Link>
        <h1 className="text-2xl font-bold">Add an expense</h1>
        <AddExpenseForm groupId={group.id} currentUserId={user.id} members={memberList} />
      </main>
    </div>
  );
}

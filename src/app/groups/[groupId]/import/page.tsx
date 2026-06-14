import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";
import CsvImportForm from "@/components/CsvImportForm";

export default async function ImportPage({ params }: { params: { groupId: string } }) {
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
    .select("user_id, profiles(id, display_name, email)")
    .eq("group_id", group.id);

  const memberList = (members ?? []).map((m: any) => ({
    id: m.user_id,
    display_name: m.profiles?.display_name ?? "Unknown",
    email: m.profiles?.email ?? "",
  }));

  const { data: reports } = await supabase
    .from("import_reports")
    .select("id, file_name, total_rows, imported_rows, skipped_rows, anomaly_count, created_at")
    .eq("group_id", group.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <NavBar userName={profile?.display_name} />
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <Link href={`/groups/${group.id}`} className="link-muted">
          ← Back to {group.name}
        </Link>
        <h1 className="text-2xl font-bold">Import expenses from CSV</h1>
        <p className="text-muted-foreground text-sm">
          Bulk-load historical expenses for <strong>{group.name}</strong>. Every row is
          validated against this group's members; anomalies are listed in the import
          report below and saved to this group's import history.
        </p>

        <CsvImportForm groupId={group.id} members={memberList} />

        {reports && reports.length > 0 && (
          <div className="card">
            <h2 className="font-semibold mb-3">Import history</h2>
            <ul className="divide-y divide-border text-sm">
              {reports.map((r: any) => (
                <li key={r.id}>
                  <Link
                    href={`/groups/${group.id}/import/${r.id}`}
                    className="flex items-center justify-between py-2 hover:bg-muted -mx-2 px-2 rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{r.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="pill pill-positive">{r.imported_rows} imported</span>
                      {r.skipped_rows > 0 && (
                        <span className="pill pill-negative">{r.skipped_rows} skipped</span>
                      )}
                      <span className="pill pill-accent">{r.anomaly_count} anomalies</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

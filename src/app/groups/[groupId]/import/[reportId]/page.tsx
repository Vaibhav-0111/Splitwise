import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";

const ANOMALY_LABELS: Record<string, string> = {
  missing_field: "Missing field",
  invalid_amount: "Invalid amount",
  unsupported_currency: "Unsupported currency",
  unknown_payer: "Unknown payer",
  unknown_participant: "Unknown participant",
  no_valid_participants: "No valid participants",
  invalid_split_type: "Invalid split type",
  mismatched_split_values: "Mismatched split values",
  percentage_normalized: "Percentages normalized",
  unequal_normalized: "Amounts normalized",
  duplicate_row: "Duplicate row",
  invalid_date: "Invalid date",
};

export default async function ImportReportPage({
  params,
}: {
  params: Promise<{ groupId: string; reportId: string }>;
}) {
  const { groupId, reportId } = await params;
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

  const { data: report } = await supabase
    .from("import_reports")
    .select("*")
    .eq("id", reportId)
    .single();
  if (!report) notFound();

  const rows: any[] = report.report ?? [];

  return (
    <div>
      <NavBar userName={profile?.display_name} />
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <Link href={`/groups/${group.id}/import`} className="link-muted">
          ← Back to import history
        </Link>
        <h1 className="text-2xl font-bold">{report.file_name}</h1>
        <p className="text-muted-foreground text-sm">
          Imported {new Date(report.created_at).toLocaleString()}
        </p>

        <div className="grid sm:grid-cols-4 gap-3">
          <div className="card text-center">
            <p className="text-2xl font-bold font-mono-data">{report.total_rows}</p>
            <p className="text-xs text-muted-foreground uppercase mt-1">Total rows</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold font-mono-data text-success">{report.imported_rows}</p>
            <p className="text-xs text-muted-foreground uppercase mt-1">Imported</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold font-mono-data text-destructive">{report.skipped_rows}</p>
            <p className="text-xs text-muted-foreground uppercase mt-1">Skipped</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold font-mono-data text-accent">{report.anomaly_count}</p>
            <p className="text-xs text-muted-foreground uppercase mt-1">Anomalies</p>
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Row-by-row report</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Row</th>
                  <th className="py-2 pr-3">Description</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Anomalies / actions taken</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r: any) => (
                  <tr key={r.row}>
                    <td className="py-2 pr-3 font-mono-data">{r.row}</td>
                    <td className="py-2 pr-3">{r.description ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {r.status === "imported" ? (
                        <span className="pill pill-positive">Imported</span>
                      ) : (
                        <span className="pill pill-negative">Skipped</span>
                      )}
                    </td>
                    <td className="py-2">
                      {(!r.anomalies || r.anomalies.length === 0) ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ul className="space-y-1">
                          {r.anomalies.map((a: any, i: number) => (
                            <li key={i}>
                              <span className="pill pill-accent mr-1">
                                {ANOMALY_LABELS[a.type] ?? a.type}
                              </span>
                              <span className="text-muted-foreground">{a.message}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import { validateRow, type MemberLookup, type RowResult, type Anomaly } from "@/lib/csvImport";

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

export default function CsvImportForm({
  groupId,
  members,
}: {
  groupId: string;
  members: MemberLookup[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDone(false);
    setFileName(file.name);
    setParsing(true);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        const seen = new Set<string>();
        const rows: RowResult[] = parsed.data.map((row, i) =>
          validateRow(row, i + 1, members, seen)
        );
        setResults(rows);
        setParsing(false);
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`);
        setParsing(false);
      },
    });
  }

  const importable = results?.filter((r) => r.status === "imported") ?? [];
  const skipped = results?.filter((r) => r.status === "skipped") ?? [];
  const allAnomalies: Anomaly[] = results?.flatMap((r) => r.anomalies) ?? [];

  async function handleConfirmImport() {
    if (!results || !fileName) return;
    setImporting(true);
    setError(null);

    let importedCount = 0;
    const failures: Anomaly[] = [];

    for (const r of importable) {
      if (!r.expense) continue;
      const { error: rpcError } = await supabase.rpc("create_expense_with_splits", {
        p_group_id: groupId,
        p_description: r.expense.description,
        p_amount: r.expense.amount,
        p_currency: r.expense.currency,
        p_paid_by: r.expense.paid_by,
        p_split_type: r.expense.split_type,
        p_splits: r.expense.splits,
        p_expense_date: r.expense.expense_date,
      });

      if (rpcError) {
        failures.push({
          row: r.row,
          type: "missing_field", // generic bucket for DB-level failures
          action: "skipped",
          message: `Database error while inserting: ${rpcError.message}`,
        });
      } else {
        importedCount++;
      }
    }

    // Persist the report
    const fullReport = results.map((r) => ({
      row: r.row,
      status: failures.some((f) => f.row === r.row) ? "skipped" : r.status,
      description: r.expense?.description ?? null,
      anomalies: [...r.anomalies, ...failures.filter((f) => f.row === r.row)],
    }));

    await supabase.from("import_reports").insert({
      group_id: groupId,
      file_name: fileName,
      total_rows: results.length,
      imported_rows: importedCount,
      skipped_rows: results.length - importedCount,
      anomaly_count: allAnomalies.length + failures.length,
      report: fullReport,
    });

    setImporting(false);
    setDone(true);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">CSV file</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="input file:mr-3 file:rounded-md file:border-0 file:bg-primary file:text-on-primary file:px-3 file:py-1.5 file:font-medium file:cursor-pointer cursor-pointer"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Expected columns: <code className="font-mono-data">description, amount, currency,
            paid_by_email, expense_date, split_type, participants, split_values</code>.
            See <code className="font-mono-data">sample-data/expenses_import_sample.csv</code> for
            an example with intentional anomalies.
          </p>
        </div>
        {error && <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-3 py-2">{error}</div>}
        {parsing && <p className="text-sm text-muted-foreground">Parsing...</p>}
      </div>

      {results && (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="card text-center">
              <p className="text-2xl font-bold font-mono-data">{results.length}</p>
              <p className="text-xs text-muted-foreground uppercase mt-1">Total rows</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold font-mono-data text-success">{importable.length}</p>
              <p className="text-xs text-muted-foreground uppercase mt-1">Importable</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold font-mono-data text-destructive">{skipped.length}</p>
              <p className="text-xs text-muted-foreground uppercase mt-1">Skipped</p>
            </div>
          </div>

          <div className="card">
            <h2 className="font-semibold mb-3">Import report preview</h2>
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
                  {results.map((r) => (
                    <tr key={r.row}>
                      <td className="py-2 pr-3 font-mono-data">{r.row}</td>
                      <td className="py-2 pr-3">{r.expense?.description ?? "—"}</td>
                      <td className="py-2 pr-3">
                        {r.status === "imported" ? (
                          <span className="pill pill-positive">Imported</span>
                        ) : (
                          <span className="pill pill-negative">Skipped</span>
                        )}
                      </td>
                      <td className="py-2">
                        {r.anomalies.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <ul className="space-y-1">
                            {r.anomalies.map((a, i) => (
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

          {!done ? (
            <button onClick={handleConfirmImport} disabled={importing || importable.length === 0} className="btn-primary w-full">
              {importing
                ? "Importing..."
                : `Confirm import (${importable.length} expense${importable.length === 1 ? "" : "s"})`}
            </button>
          ) : (
            <div className="bg-success/10 text-success text-sm rounded-lg px-3 py-2 text-center">
              Import complete! {importable.length} expense(s) added. The report has been saved
              below and to this group's import history.
            </div>
          )}
        </>
      )}
    </div>
  );
}

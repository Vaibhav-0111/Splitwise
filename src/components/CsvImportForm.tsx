"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import { validateRow, findMemberByName, parseSplitDetailPart, type MemberLookup, type RowResult, type Anomaly } from "@/lib/csvImport";

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
  const [virtualMembers, setVirtualMembers] = useState<MemberLookup[]>([]);

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
        const localMembers = [...members];
        const addedVirtualNames = new Set<string>();

        parsed.data.forEach((row) => {
          // 1. Paid by name
          const paidByName = (row.paid_by ?? "").trim();
          if (paidByName) {
            const payerLower = paidByName.toLowerCase();
            const existing = findMemberByName(paidByName, localMembers);
            if (!existing && !addedVirtualNames.has(payerLower)) {
              const virtualId = crypto.randomUUID();
              const virtualEmail = `${paidByName.toLowerCase().replace(/[^a-z0-9]/g, "")}-${groupId.slice(0, 8)}@splitsy.temp`;
              localMembers.push({
                id: virtualId,
                email: virtualEmail,
                display_name: paidByName,
                isVirtual: true,
              });
              addedVirtualNames.add(payerLower);
            }
          }

          // 2. Split with names
          const splitWithNames = (row.split_with ?? "")
            .split(";")
            .map((n) => n.trim())
            .filter(Boolean);
          splitWithNames.forEach((name) => {
            const nameLower = name.toLowerCase();
            const existing = findMemberByName(name, localMembers);
            if (!existing && !addedVirtualNames.has(nameLower)) {
              const virtualId = crypto.randomUUID();
              const virtualEmail = `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}-${groupId.slice(0, 8)}@splitsy.temp`;
              localMembers.push({
                id: virtualId,
                email: virtualEmail,
                display_name: name,
                isVirtual: true,
              });
              addedVirtualNames.add(nameLower);
            }
          });

          // 3. Split details names
          const splitDetails = (row.split_details ?? "");
          if (splitDetails) {
            const parts = splitDetails.split(";").map((p) => p.trim()).filter(Boolean);
            parts.forEach((part) => {
              const parsedPart = parseSplitDetailPart(part);
              if (parsedPart) {
                const name = parsedPart.name;
                const nameLower = name.toLowerCase();
                const existing = findMemberByName(name, localMembers);
                if (!existing && !addedVirtualNames.has(nameLower)) {
                  const virtualId = crypto.randomUUID();
                  const virtualEmail = `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}-${groupId.slice(0, 8)}@splitsy.temp`;
                  localMembers.push({
                    id: virtualId,
                    email: virtualEmail,
                    display_name: name,
                    isVirtual: true,
                  });
                  addedVirtualNames.add(nameLower);
                }
              }
            });
          }
        });

        setVirtualMembers(localMembers.filter((m) => m.isVirtual));

        const rows: RowResult[] = parsed.data.map((row, i) =>
          validateRow(row, i + 1, localMembers, seen)
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

    // 0. Auto-create virtual members in the database
    for (const vm of virtualMembers) {
      try {
        const { error: pErr } = await supabase
          .from("profiles")
          .upsert({
            id: vm.id,
            email: vm.email,
            display_name: vm.display_name,
            created_at: new Date().toISOString()
          });
          
        if (pErr) {
          setError(`Failed to create profile for member "${vm.display_name}": ${pErr.message}`);
          setImporting(false);
          return;
        }
        
        const { error: gmErr } = await supabase
          .from("group_members")
          .insert({
            group_id: groupId,
            user_id: vm.id,
            role: "member"
          });
          
        if (gmErr) {
          // Ignore duplicate member key errors
          if (gmErr.code !== "23505") {
            setError(`Failed to add member "${vm.display_name}" to group: ${gmErr.message}`);
            setImporting(false);
            return;
          }
        }
      } catch (err: any) {
        setError(`Failed to register virtual member "${vm.display_name}": ${err.message || err}`);
        setImporting(false);
        return;
      }
    }

    let importedCount = 0;
    const failures: Anomaly[] = [];

    // Get current user ID to populate created_by
    const { data: { user } } = await supabase.auth.getUser();
    const currentUserId = user?.id || importable[0]?.expense?.paid_by;

    for (const r of importable) {
      if (!r.expense) continue;

      try {
        // 1. Insert into public.expenses
        const { data: expenseData, error: expenseError } = await supabase
          .from("expenses")
          .insert({
            group_id: groupId,
            description: r.expense.description,
            amount: r.expense.amount,
            currency: r.expense.currency,
            paid_by: r.expense.paid_by,
            created_by: currentUserId,
            split_type: r.expense.split_type,
            expense_date: r.expense.expense_date,
          })
          .select("id")
          .single();

        if (expenseError) {
          failures.push({
            row: r.row,
            type: "missing_field",
            action: "skipped",
            message: `Database error while inserting expense: ${expenseError.message}`,
          });
          continue;
        }

        // 2. Insert into public.expense_splits
        const splitsToInsert = r.expense.splits.map((s: any) => ({
          expense_id: expenseData.id,
          user_id: s.user_id,
          amount: s.amount,
          percentage: s.percentage,
          shares: s.shares,
        }));

        const { error: splitsError } = await supabase
          .from("expense_splits")
          .insert(splitsToInsert);

        if (splitsError) {
          failures.push({
            row: r.row,
            type: "missing_field",
            action: "skipped",
            message: `Database error while inserting splits: ${splitsError.message}`,
          });
          // Rollback orphan expense
          await supabase.from("expenses").delete().eq("id", expenseData.id);
        } else {
          importedCount++;
        }
      } catch (err: any) {
        failures.push({
          row: r.row,
          type: "missing_field",
          action: "skipped",
          message: `Unexpected error: ${err.message || err}`,
        });
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
            Expected columns: <code className="font-mono-data">date, description, paid_by,
            amount, currency, split_type, split_with, split_details, notes</code>.
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

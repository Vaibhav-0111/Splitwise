// ============================================================
// CSV bulk-import validation & anomaly detection
//
// Expected CSV columns:
//   description, amount, currency, paid_by_email, expense_date,
//   split_type, participants, split_values
//
//   - participants: semicolon-separated list of member emails
//   - split_values: semicolon-separated numbers, meaning depends
//     on split_type:
//       equal      -> ignored
//       unequal    -> dollar amount per participant (same order)
//       percentage -> percentage per participant (same order)
//       shares     -> share count per participant (same order)
//
// See SCOPE.md for the full anomaly taxonomy this module
// implements.
// ============================================================

export type AnomalyAction = "skipped" | "corrected" | "defaulted";

export type AnomalyType =
  | "missing_field"
  | "invalid_amount"
  | "unsupported_currency"
  | "unknown_payer"
  | "unknown_participant"
  | "no_valid_participants"
  | "invalid_split_type"
  | "mismatched_split_values"
  | "percentage_normalized"
  | "unequal_normalized"
  | "duplicate_row"
  | "invalid_date";

export interface Anomaly {
  row: number; // 1-indexed, matches CSV line (excluding header)
  type: AnomalyType;
  action: AnomalyAction;
  message: string;
}

export interface ImportableExpense {
  description: string;
  amount: number;
  currency: string;
  paid_by: string; // user id
  expense_date: string; // YYYY-MM-DD
  split_type: "equal" | "unequal" | "percentage" | "shares";
  splits: { user_id: string; amount: number; percentage: number | null; shares: number | null }[];
}

export interface RowResult {
  row: number;
  status: "imported" | "skipped";
  anomalies: Anomaly[];
  expense?: ImportableExpense;
}

export interface MemberLookup {
  id: string;
  email: string;
  display_name: string;
}

const SUPPORTED_CURRENCY = "USD";
const TOLERANCE = 0.01;

function parseCsvDate(value: string): string {
  value = (value ?? "").trim();
  if (!value) return "";
  
  // Case 1: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  
  // Case 2: DD-MM-YYYY or MM-DD-YYYY
  let match = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    
    const monthStr = String(month).padStart(2, "0");
    const dayStr = String(day).padStart(2, "0");
    return `${year}-${monthStr}-${dayStr}`;
  }

  // Case 3: Month-DD or DD-Month
  const monthMap: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
  };
  
  match = value.match(/^([a-zA-Z]+)[-/](\d{1,2})$/) || value.match(/^(\d{1,2})[-/]([a-zA-Z]+)$/);
  if (match) {
    let monthName = "";
    let day = 0;
    if (isNaN(Number(match[1]))) {
      monthName = match[1].toLowerCase().slice(0, 3);
      day = parseInt(match[2], 10);
    } else {
      day = parseInt(match[1], 10);
      monthName = match[2].toLowerCase().slice(0, 3);
    }
    const monthVal = monthMap[monthName];
    if (monthVal) {
      const year = 2026; // Default to 2026 as per our database records
      const dayStr = String(day).padStart(2, "0");
      return `${year}-${monthVal}-${dayStr}`;
    }
  }

  // Fallback: try native Date parsing
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  
  return "";
}

function findMemberByName(name: string, members: MemberLookup[]): MemberLookup | undefined {
  const cleanName = name.trim().toLowerCase();
  if (!cleanName) return undefined;
  
  // Try exact match first
  let match = members.find((m) => m.display_name.trim().toLowerCase() === cleanName);
  if (match) return match;
  
  // Try matching email prefix
  match = members.find((m) => m.email.split("@")[0].trim().toLowerCase() === cleanName);
  if (match) return match;

  // Try fuzzy matching (start-with or contains)
  match = members.find((m) => {
    const mName = m.display_name.trim().toLowerCase();
    return mName.startsWith(cleanName) || cleanName.startsWith(mName);
  });
  if (match) return match;
  
  return undefined;
}

function parseSplitDetailPart(part: string): { name: string; value: number } | null {
  part = part.trim();
  if (!part) return null;
  
  const lastSpaceIdx = part.lastIndexOf(" ");
  if (lastSpaceIdx === -1) return null;
  
  const name = part.substring(0, lastSpaceIdx).trim();
  const valueStr = part.substring(lastSpaceIdx + 1).replace(/%/g, "").trim();
  const value = parseFloat(valueStr);
  
  if (isNaN(value)) return null;
  return { name, value };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function validateRow(
  raw: Record<string, string>,
  rowNumber: number,
  members: MemberLookup[],
  seenRowKeys: Set<string>
): RowResult {
  const anomalies: Anomaly[] = [];

  // ---- 1. Required fields ----
  let description = (raw.description ?? "").trim();
  const amountRaw = (raw.amount ?? "").trim();
  const paidByName = (raw.paid_by ?? "").trim();
  const notes = (raw.notes ?? "").trim();

  const missing: string[] = [];
  if (!description) missing.push("description");
  if (!amountRaw) missing.push("amount");
  if (!paidByName) missing.push("paid_by");

  if (missing.length > 0) {
    anomalies.push({
      row: rowNumber,
      type: "missing_field",
      action: "skipped",
      message: `Missing required field(s): ${missing.join(", ")}.`,
    });
    return { row: rowNumber, status: "skipped", anomalies };
  }

  // Append notes to description if present
  if (notes) {
    description = `${description} (${notes})`;
  }

  // ---- 2. Amount validity (handle commas in quotes) ----
  const cleanAmountRaw = amountRaw.replace(/,/g, "");
  const amount = Number(cleanAmountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    anomalies.push({
      row: rowNumber,
      type: "invalid_amount",
      action: "skipped",
      message: `Amount "${amountRaw}" is not a positive number.`,
    });
    return { row: rowNumber, status: "skipped", anomalies };
  }

  // ---- 3. Currency ----
  let currency = (raw.currency ?? "").trim().toUpperCase();
  if (!currency) {
    anomalies.push({
      row: rowNumber,
      type: "unsupported_currency",
      action: "defaulted",
      message: `Currency is missing; defaulted to INR.`,
    });
    currency = "INR";
  }

  // ---- 4. Payer must be a known group member ----
  const payer = findMemberByName(paidByName, members);
  if (!payer) {
    anomalies.push({
      row: rowNumber,
      type: "unknown_payer",
      action: "skipped",
      message: `paid_by "${paidByName}" does not match any member of this group.`,
    });
    return { row: rowNumber, status: "skipped", anomalies };
  }

  // ---- 5. Date ----
  const dateRaw = (raw.date ?? "").trim();
  let expenseDate = parseCsvDate(dateRaw);
  if (!expenseDate) {
    const today = new Date().toISOString().slice(0, 10);
    anomalies.push({
      row: rowNumber,
      type: "invalid_date",
      action: "defaulted",
      message: `date "${dateRaw}" is not a valid date format; defaulted to today (${today}).`,
    });
    expenseDate = today;
  }

  // ---- 6. Duplicate detection ----
  const dedupeKey = `${description.toLowerCase()}|${amount}|${payer.id}|${expenseDate}`;
  if (seenRowKeys.has(dedupeKey)) {
    anomalies.push({
      row: rowNumber,
      type: "duplicate_row",
      action: "skipped",
      message: `Identical to a previously-seen row (same description, amount, payer, and date).`,
    });
    return { row: rowNumber, status: "skipped", anomalies };
  }
  seenRowKeys.add(dedupeKey);

  // ---- 7. Participants ----
  const splitWithNames = (raw.split_with ?? "")
    .split(";")
    .map((n) => n.trim())
    .filter(Boolean);

  const participants: MemberLookup[] = [];
  const unknownNames: string[] = [];
  for (const name of splitWithNames) {
    const m = findMemberByName(name, members);
    if (m) {
      if (!participants.some((p) => p.id === m.id)) {
        participants.push(m);
      }
    } else {
      unknownNames.push(name);
    }
  }

  if (unknownNames.length > 0) {
    anomalies.push({
      row: rowNumber,
      type: "unknown_participant",
      action: "corrected",
      message: `Participant(s) not in this group were dropped from the split: ${unknownNames.join(", ")}.`,
    });
  }

  if (participants.length === 0) {
    anomalies.push({
      row: rowNumber,
      type: "no_valid_participants",
      action: "defaulted",
      message: `No valid participants listed; defaulted to the payer only (100% to ${payer.display_name}).`,
    });
    participants.push(payer);
  }

  // ---- 8. Split type ----
  const validSplitTypes = ["equal", "unequal", "percentage", "shares"] as const;
  let splitTypeRaw = (raw.split_type ?? "").trim().toLowerCase();
  if (splitTypeRaw === "share") splitTypeRaw = "shares";
  
  let splitType = splitTypeRaw as (typeof validSplitTypes)[number];
  if (!validSplitTypes.includes(splitType)) {
    anomalies.push({
      row: rowNumber,
      type: "invalid_split_type",
      action: "defaulted",
      message: `split_type "${raw.split_type}" is not recognized (expected equal/unequal/percentage/shares); defaulted to "equal".`,
    });
    splitType = "equal";
  }

  // Parse split details if not equal
  const parsedDetailsMap = new Map<string, number>();
  if (splitType !== "equal" && raw.split_details) {
    const parts = raw.split_details.split(";").map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      const parsed = parseSplitDetailPart(part);
      if (parsed) {
        const m = findMemberByName(parsed.name, members);
        if (m) {
          parsedDetailsMap.set(m.id, parsed.value);
        }
      }
    }
  }

  let hasMismatch = false;
  if (splitType !== "equal") {
    for (const p of participants) {
      if (!parsedDetailsMap.has(p.id)) {
        hasMismatch = true;
        break;
      }
    }
  }

  // ---- 9. Compute splits per split_type, with validation ----
  const TOLERANCE = 0.01;
  let splits: ImportableExpense["splits"];

  if (splitType === "equal") {
    const share = amount / participants.length;
    splits = participants.map((p) => ({
      user_id: p.id,
      amount: round2(share),
      percentage: null,
      shares: null,
    }));
  } else if (splitType === "unequal") {
    if (hasMismatch) {
      anomalies.push({
        row: rowNumber,
        type: "mismatched_split_values",
        action: "defaulted",
        message: `split_details does not contain values for all participants; defaulted to an equal split.`,
      });
      const share = amount / participants.length;
      splits = participants.map((p) => ({
        user_id: p.id,
        amount: round2(share),
        percentage: null,
        shares: null,
      }));
    } else {
      const values = participants.map((p) => parsedDetailsMap.get(p.id) || 0);
      const sum = values.reduce((s, v) => s + v, 0);
      if (Math.abs(sum - amount) > TOLERANCE) {
        anomalies.push({
          row: rowNumber,
          type: "unequal_normalized",
          action: "corrected",
          message: `Unequal split values summed to ${sum.toFixed(2)}, not the expense total ${amount.toFixed(2)}; values were scaled proportionally to match.`,
        });
      }
      const scale = sum > 0 ? amount / sum : 1 / participants.length;
      splits = participants.map((p, i) => ({
        user_id: p.id,
        amount: round2(sum > 0 ? values[i] * scale : amount / participants.length),
        percentage: null,
        shares: null,
      }));
    }
  } else if (splitType === "percentage") {
    if (hasMismatch) {
      anomalies.push({
        row: rowNumber,
        type: "mismatched_split_values",
        action: "defaulted",
        message: `split_details does not contain percentage values for all participants; defaulted to an equal split.`,
      });
      const share = amount / participants.length;
      splits = participants.map((p) => ({
        user_id: p.id,
        amount: round2(share),
        percentage: round2(100 / participants.length),
        shares: null,
      }));
    } else {
      const values = participants.map((p) => parsedDetailsMap.get(p.id) || 0);
      const sum = values.reduce((s, v) => s + v, 0);
      if (Math.abs(sum - 100) > TOLERANCE) {
        anomalies.push({
          row: rowNumber,
          type: "percentage_normalized",
          action: "corrected",
          message: `Percentages summed to ${sum.toFixed(1)}%, not 100%; values were normalized proportionally.`,
        });
      }
      const scale = sum > 0 ? 100 / sum : 100 / participants.length;
      splits = participants.map((p, i) => {
        const pct = sum > 0 ? values[i] * scale : 100 / participants.length;
        return {
          user_id: p.id,
          amount: round2((amount * pct) / 100),
          percentage: round2(pct),
          shares: null,
        };
      });
    }
  } else {
    // shares
    if (hasMismatch) {
      anomalies.push({
        row: rowNumber,
        type: "mismatched_split_values",
        action: "defaulted",
        message: `split_details does not contain share counts for all participants; defaulted to an equal split (1 share each).`,
      });
      const share = amount / participants.length;
      splits = participants.map((p) => ({
        user_id: p.id,
        amount: round2(share),
        percentage: null,
        shares: 1,
      }));
    } else {
      const values = participants.map((p) => parsedDetailsMap.get(p.id) || 0);
      const totalShares = values.reduce((s, v) => s + v, 0);
      splits = participants.map((p, i) => ({
        user_id: p.id,
        amount: round2(totalShares > 0 ? (amount * values[i]) / totalShares : amount / participants.length),
        percentage: null,
        shares: values[i],
      }));
    }
  }

  // ---- 10. Fix rounding drift so splits sum exactly to `amount` ----
  const splitSum = splits.reduce((s, sp) => s + sp.amount, 0);
  const drift = round2(amount - splitSum);
  if (drift !== 0 && splits.length > 0) {
    splits[splits.length - 1].amount = round2(splits[splits.length - 1].amount + drift);
  }

  return {
    row: rowNumber,
    status: "imported",
    anomalies,
    expense: {
      description,
      amount,
      currency,
      paid_by: payer.id,
      expense_date: expenseDate,
      split_type: splitType,
      splits,
    },
  };
}

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

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Validates and transforms a single CSV row into an ImportableExpense,
 * or marks it as skipped, recording every anomaly encountered along
 * the way (whether the row was skipped, corrected, or had a value
 * defaulted).
 *
 * `seenRowKeys` is a mutable Set shared across all rows in the file,
 * used to detect exact-duplicate rows.
 */
export function validateRow(
  raw: Record<string, string>,
  rowNumber: number,
  members: MemberLookup[],
  seenRowKeys: Set<string>
): RowResult {
  const anomalies: Anomaly[] = [];
  const emailToMember = new Map(members.map((m) => [m.email.trim().toLowerCase(), m]));

  // ---- 1. Required fields ----
  const description = (raw.description ?? "").trim();
  const amountRaw = (raw.amount ?? "").trim();
  const paidByEmail = (raw.paid_by_email ?? "").trim().toLowerCase();

  const missing: string[] = [];
  if (!description) missing.push("description");
  if (!amountRaw) missing.push("amount");
  if (!paidByEmail) missing.push("paid_by_email");

  if (missing.length > 0) {
    anomalies.push({
      row: rowNumber,
      type: "missing_field",
      action: "skipped",
      message: `Missing required field(s): ${missing.join(", ")}.`,
    });
    return { row: rowNumber, status: "skipped", anomalies };
  }

  // ---- 2. Amount validity ----
  const amount = Number(amountRaw);
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
  let currency = (raw.currency ?? "").trim().toUpperCase() || SUPPORTED_CURRENCY;
  if (currency !== SUPPORTED_CURRENCY) {
    anomalies.push({
      row: rowNumber,
      type: "unsupported_currency",
      action: "defaulted",
      message: `Currency "${currency}" is not supported (USD only); defaulted to USD. Amount was NOT converted.`,
    });
    currency = SUPPORTED_CURRENCY;
  }

  // ---- 4. Payer must be a known group member ----
  const payer = emailToMember.get(paidByEmail);
  if (!payer) {
    anomalies.push({
      row: rowNumber,
      type: "unknown_payer",
      action: "skipped",
      message: `paid_by_email "${paidByEmail}" does not match any member of this group.`,
    });
    return { row: rowNumber, status: "skipped", anomalies };
  }

  // ---- 5. Date ----
  let expenseDate = (raw.expense_date ?? "").trim();
  if (!isValidDate(expenseDate)) {
    const today = new Date().toISOString().slice(0, 10);
    anomalies.push({
      row: rowNumber,
      type: "invalid_date",
      action: "defaulted",
      message: `expense_date "${expenseDate}" is not a valid YYYY-MM-DD date; defaulted to today (${today}).`,
    });
    expenseDate = today;
  }

  // ---- 6. Duplicate detection ----
  // Exact duplicates are defined as same description + amount + payer + date.
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
  const participantEmailsRaw = (raw.participants ?? "")
    .split(";")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const participants: MemberLookup[] = [];
  const unknownEmails: string[] = [];
  for (const email of participantEmailsRaw) {
    const m = emailToMember.get(email);
    if (m) participants.push(m);
    else unknownEmails.push(email);
  }

  if (unknownEmails.length > 0) {
    anomalies.push({
      row: rowNumber,
      type: "unknown_participant",
      action: "corrected",
      message: `Participant(s) not in this group were dropped from the split: ${unknownEmails.join(", ")}.`,
    });
  }

  // If payer wasn't listed as a participant but participants list is
  // otherwise non-empty, we leave it as-is (payer doesn't have to be
  // a participant). If the participants list ends up empty, fall back
  // to splitting between the payer alone.
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
  let splitType = (raw.split_type ?? "").trim().toLowerCase() as (typeof validSplitTypes)[number];
  const splitValuesRaw = (raw.split_values ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

  if (!validSplitTypes.includes(splitType)) {
    anomalies.push({
      row: rowNumber,
      type: "invalid_split_type",
      action: "defaulted",
      message: `split_type "${raw.split_type}" is not recognized (expected equal/unequal/percentage/shares); defaulted to "equal".`,
    });
    splitType = "equal";
  }

  // ---- 9. Compute splits per split_type, with validation ----
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
    if (splitValuesRaw.length !== participants.length) {
      anomalies.push({
        row: rowNumber,
        type: "mismatched_split_values",
        action: "defaulted",
        message: `split_values count (${splitValuesRaw.length}) does not match participant count (${participants.length}); defaulted to an equal split.`,
      });
      const share = amount / participants.length;
      splits = participants.map((p) => ({
        user_id: p.id,
        amount: round2(share),
        percentage: null,
        shares: null,
      }));
    } else {
      const values = splitValuesRaw.map((v) => Number(v) || 0);
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
    if (splitValuesRaw.length !== participants.length) {
      anomalies.push({
        row: rowNumber,
        type: "mismatched_split_values",
        action: "defaulted",
        message: `split_values count (${splitValuesRaw.length}) does not match participant count (${participants.length}); defaulted to an equal split.`,
      });
      const share = amount / participants.length;
      splits = participants.map((p) => ({
        user_id: p.id,
        amount: round2(share),
        percentage: round2(100 / participants.length),
        shares: null,
      }));
    } else {
      const values = splitValuesRaw.map((v) => Number(v) || 0);
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
    if (splitValuesRaw.length !== participants.length) {
      anomalies.push({
        row: rowNumber,
        type: "mismatched_split_values",
        action: "defaulted",
        message: `split_values count (${splitValuesRaw.length}) does not match participant count (${participants.length}); defaulted to an equal split (1 share each).`,
      });
      const share = amount / participants.length;
      splits = participants.map((p) => ({
        user_id: p.id,
        amount: round2(share),
        percentage: null,
        shares: 1,
      }));
    } else {
      const values = splitValuesRaw.map((v) => Number(v) || 0);
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

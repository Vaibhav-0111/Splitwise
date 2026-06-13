# SCOPE.md — CSV Import Anomaly Log & Database Schema

This document covers (1) the anomaly taxonomy implemented for the CSV bulk-import
feature, demonstrated against `sample-data/expenses_import_sample.csv`, and (2) the
finalized relational database schema.

---

## 1. CSV Import — Anomaly Types & Handling

The import pipeline (`src/lib/csvImport.ts`) validates each row of an expenses CSV
against the current group's membership and the expense schema. Expected columns:

```
description, amount, currency, paid_by_email, expense_date, split_type, participants, split_values
```

Every anomaly found is logged with: the **row number**, an **anomaly type**, the
**action taken** (`skipped` / `corrected` / `defaulted`), and a human-readable
message. The full log is shown to the user as the **Import Report** and persisted in
`import_reports.report` (JSONB).

### Anomaly types found in `sample-data/expenses_import_sample.csv`

| # | Row | Anomaly type | Description in sample data | Action taken |
|---|---|---|---|---|
| 1 | 2 | `unsupported_currency` | "Dinner at Olive Garden" has `currency=EUR` | Defaulted to USD; **amount not converted** (no FX rates available) — flagged so a human can review/correct the amount if needed |
| 2 | 3 | `missing_field` | Row has empty `description` | Row **skipped** entirely — description is required for every expense |
| 3 | 4 | `invalid_amount` | "Taxi to airport" has `amount=abc` (non-numeric) | Row **skipped** — cannot create an expense without a valid positive amount |
| 4 | 5 | `unknown_payer` | "Movie tickets" paid by `dave@example.com`, who is not a member of this group | Row **skipped** — cannot attribute an expense to someone outside the group |
| 5 | 6 | `unknown_participant` | "Pizza night" includes `dave@example.com` as a participant | That participant **dropped** from the split; remaining valid participants split the full amount |
| 6 | 7 | `invalid_split_type` | "Hotel booking" has `split_type=custom` (not a recognized type) | **Defaulted** to `equal` split among listed participants |
| 7 | 8 | `mismatched_split_values` | "Utilities" is `split_type=unequal` with 3 participants but only 2 `split_values` (`40;40`) | **Defaulted** to an equal split — partial/ambiguous split data is not guessable |
| 8 | 9 | `percentage_normalized` | "Rent split" percentages are `50;30;30` = 110%, not 100% | Values **normalized proportionally** so they sum to exactly 100% |
| 9 | 10 | `unequal_normalized` | "Flights" unequal amounts `200;200;150` = 550, but expense total is 600 | Values **scaled proportionally** so they sum to exactly 600 |
| 10 | 11 | `duplicate_row` | "Groceries" $60 from Alice on 2026-05-01 — identical to row 2 | Row **skipped** as an exact duplicate (same description + amount + payer + date) |
| 11 | 12 | `invalid_date` | "Snacks" has `expense_date=not-a-date` | **Defaulted** to today's date |
| 12 | 14 | `invalid_amount` | "Parking" has `amount=-20` (negative) | Row **skipped** — amounts must be positive |

Row 13 ("Coffee run", shares split `2;1` between Alice and Bob) is a **clean row**
with no anomalies — included to demonstrate the happy path for the `shares` split
type.

### Anomaly type reference (full taxonomy)

| Type | Trigger | Action |
|---|---|---|
| `missing_field` | `description`, `amount`, or `paid_by_email` empty | skip row |
| `invalid_amount` | amount not a positive number | skip row |
| `unsupported_currency` | currency ≠ USD | default to USD, keep amount as-is, flag for review |
| `unknown_payer` | `paid_by_email` not a group member | skip row |
| `unknown_participant` | one or more `participants` emails not a group member | drop those participants, keep the rest |
| `no_valid_participants` | after dropping unknown participants, none remain | default to payer-only (100%) |
| `invalid_split_type` | `split_type` not one of equal/unequal/percentage/shares | default to `equal` |
| `mismatched_split_values` | `split_values` count ≠ participant count (for unequal/percentage/shares) | default to `equal` |
| `percentage_normalized` | percentages don't sum to 100% (±0.01) | scale proportionally to 100% |
| `unequal_normalized` | unequal amounts don't sum to expense total (±0.01) | scale proportionally to total |
| `duplicate_row` | identical (description, amount, payer, date) seen earlier in file | skip row |
| `invalid_date` | `expense_date` not a valid `YYYY-MM-DD` date | default to today |

### Design principle
**Skip when data is unsafe to guess (missing/invalid required fields, unknown
people); correct/default when a reasonable, clearly-flagged default exists
(currency, dates, split types, normalization of amounts that are "close" to
correct).** Every correction and skip is visible in the report — nothing happens
silently.

---

## 2. Database Schema (final)

Postgres via Supabase. See `supabase/migrations/0001_init.sql` and
`supabase/migrations/0002_csv_import.sql` for full DDL including RLS policies.

### `profiles`
1:1 with `auth.users`, auto-created on signup.
| Column | Type |
|---|---|
| id | uuid PK (= auth.users.id) |
| email | text unique |
| display_name | text |
| avatar_url | text null |
| created_at | timestamptz |

### `groups`
| Column | Type |
|---|---|
| id | uuid PK |
| name | text |
| created_by | uuid → profiles |
| created_at | timestamptz |

### `group_members`
| Column | Type |
|---|---|
| id | uuid PK |
| group_id | uuid → groups (cascade) |
| user_id | uuid → profiles (cascade) |
| role | text (`owner` \| `member`) |
| joined_at | timestamptz |
| | unique (group_id, user_id) |

### `expenses`
| Column | Type |
|---|---|
| id | uuid PK |
| group_id | uuid → groups (cascade) |
| description | text |
| amount | numeric(12,2), > 0 |
| currency | text, default `USD` |
| paid_by | uuid → profiles |
| created_by | uuid → profiles |
| split_type | text (`equal`\|`unequal`\|`percentage`\|`shares`) |
| **expense_date** | date, default `current_date` — *added in migration 0002 to support CSV-imported historical expenses* |
| created_at, updated_at | timestamptz |

### `expense_splits`
One row per participant per expense. `amount` is always the final normalized dollar
value (regardless of split_type), so balance queries are split-type-agnostic.
| Column | Type |
|---|---|
| id | uuid PK |
| expense_id | uuid → expenses (cascade) |
| user_id | uuid → profiles |
| amount | numeric(12,2), >= 0 |
| percentage | numeric(5,2) null — display only |
| shares | numeric(8,2) null — display only |
| | unique (expense_id, user_id) |

### `expense_messages`
| Column | Type |
|---|---|
| id | uuid PK |
| expense_id | uuid → expenses (cascade) |
| user_id | uuid → profiles |
| message | text |
| created_at | timestamptz |

### `settlements`
| Column | Type |
|---|---|
| id | uuid PK |
| group_id | uuid → groups (cascade) |
| from_user | uuid → profiles |
| to_user | uuid → profiles |
| amount | numeric(12,2), > 0 |
| note | text null |
| created_at | timestamptz |
| | CHECK (from_user <> to_user) |

### `import_reports` *(new in migration 0002)*
One row per CSV import attempt; `report` holds the full per-row anomaly log shown in
the UI.
| Column | Type |
|---|---|
| id | uuid PK |
| group_id | uuid → groups (cascade) |
| created_by | uuid → profiles |
| file_name | text |
| total_rows | integer |
| imported_rows | integer |
| skipped_rows | integer |
| anomaly_count | integer |
| report | jsonb — array of `{row, status, description, anomalies[]}` |
| created_at | timestamptz |

### RPC functions
- `is_group_member(group_id, user_id)` — RLS helper.
- `create_expense_with_splits(group_id, description, amount, currency, paid_by,
  split_type, splits jsonb, expense_date date default current_date)` — atomic
  expense + splits insert; used by both the manual "Add expense" form and the CSV
  importer (which passes a historical `expense_date`).
- `get_group_balances(group_id)` — net balance per member.
- `get_group_pairwise_balances(group_id)` — netted "who owes whom" per pair.

### RLS
All tables have RLS enabled, gated on group membership via `is_group_member`. See
`AI_CONTEXT.md` §4 and the migration files for full policy definitions.

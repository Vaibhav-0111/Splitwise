# DECISIONS.md — Decision Log

Each entry: the decision, the options considered, and why the chosen option won.
Entries are numbered in the order decisions were made.

---

### D1. Overall backend approach: Supabase vs. custom API server
**Options considered:**
- (a) Next.js + a custom Express/FastAPI backend + a separately-hosted Postgres
  instance (e.g. Railway/Neon).
- (b) Next.js + Supabase (Postgres + Auth + Realtime + Row Level Security) with no
  separate API server.

**Chosen:** (b) Supabase.

**Why:** The assignment requires a relational DB, auth, and real-time chat. Supabase
provides all three as managed services on one platform, letting authorization be
enforced declaratively via Postgres RLS rather than hand-written middleware. This
maximizes time spent on schema/product correctness (what's actually being graded)
versus infrastructure plumbing, within a 2-day timeline.

---

### D2. Balance calculation: multi-hop debt simplification vs. direct pairwise netting
**Options considered:**
- (a) Full debt-simplification graph algorithm (Splitwise's real behavior): if A owes
  B and B owes C, simplify to A owes C where possible.
- (b) Direct pairwise netting only: for each pair {A,B}, net all debts between them
  into a single signed balance; no cross-pair simplification.

**Chosen:** (b) Pairwise netting.

**Why:** (a) requires a min-cost-flow-style algorithm with edge cases (cycles,
partial settlements, multiple valid simplifications) that are hard to get right and
explain in a live code-walkthrough. (b) is correct, easy to verify by hand, and
matches what most users actually want to know ("what do *I* owe *this person*").
Documented as a future improvement in `AI_CONTEXT.md` §10.

---

### D3. `expense_splits.amount` — normalized dollars vs. storing split_type-specific values only
**Options considered:**
- (a) Store only `percentage`/`shares` per split_type; compute dollar amounts at
  query time depending on split_type.
- (b) Always compute and store the final dollar `amount` per split at write time
  (regardless of split_type), storing `percentage`/`shares` only as display metadata.

**Chosen:** (b).

**Why:** Balance queries (`get_group_balances`, `get_group_pairwise_balances`) become
split-type-agnostic — they just `sum(amount)`. This avoids a `case` branch per
split_type in every aggregate query and removes a class of bugs where balance math
and display math could disagree.

---

### D4. Adding members to a group: lookup-by-email vs. pending email invites
**Options considered:**
- (a) Support inviting users by email even if they don't have an account yet (pending
  invite row, activated on signup).
- (b) Require the invitee to already have a Splitsy account; look them up by email.

**Chosen:** (b).

**Why:** (a) requires an invite table, an activation flow on signup, and email
delivery (or at least a "claim your invites" UI) — meaningful scope for a 2-day
build. (b) is a one-query lookup. Documented as out-of-scope in `AI_CONTEXT.md` §2.

---

### D5. Settlements: bookkeeping record vs. payment gateway integration
**Options considered:**
- (a) Integrate a real payment provider (Stripe Connect, etc.) so "settle up" moves
  real money.
- (b) "Settle up" is a manual record: "X paid Y $Z", purely for balance bookkeeping.

**Chosen:** (b).

**Why:** This mirrors Splitwise's own primary behavior (most users settle via
Venmo/cash and just *record* it). A payment integration adds compliance, sandbox
accounts, and webhook handling — out of scope for the assignment's evaluation focus
(product understanding + engineering execution, not payments infrastructure).

---

### D6. UI design system — generic Tailwind defaults vs. a generated design system (UI/UX Pro Max skill)
**Options considered:**
- (a) Keep the original light-theme Tailwind defaults (white cards, gray text, green
  brand color) used in the first build pass.
- (b) Run the "UI/UX Pro Max" skill's design-system generator against the app's
  domain (fintech/expense-sharing dashboard) and apply the resulting tokens
  (palette, typography, component styling) across the whole app.

**Chosen:** (b).

**Why:** The generator recommended a dark "Accessible & Ethical" dashboard theme
(WCAG AAA-oriented, amber/gold primary for "trust", purple accent for "tech", Fira
Sans/Fira Code typography for data-heavy screens) — a meaningfully more
distinctive and polished look than ad-hoc Tailwind defaults, and well-suited to a
numbers-heavy app (balances, splits, import reports). Implemented via CSS variables
in `globals.css` + Tailwind color tokens, so the whole app re-themes from one place.

---

### D7. CSV import column design: free-form vs. structured-with-explicit-split-columns
**Options considered:**
- (a) A minimal CSV (description, amount, payer, group) and require all splits to be
  equal — simplest possible import.
- (b) A richer CSV that mirrors the manual "Add expense" form: `participants` +
  `split_values` columns, supporting all four split types, with `split_type`
  determining how `split_values` is interpreted.

**Chosen:** (b).

**Why:** Real-world expense exports (bank statements, shared-ledger spreadsheets)
commonly need unequal/percentage splits — supporting only `equal` would make the
importer far less useful and wouldn't exercise the same validation logic as the
manual form. The added parsing complexity is contained entirely in
`src/lib/csvImport.ts`, which is unit-testable in isolation.

---

### D8. Anomaly handling philosophy: reject-on-any-issue vs. skip-or-correct-with-logging
**Options considered:**
- (a) Reject the entire CSV file if *any* row has an issue — forces a "clean" file.
- (b) Process row-by-row: skip rows that are unsafe to guess (missing required data,
  unknown people, invalid amounts), and correct/default rows with a clearly-flagged,
  reasonable default (currency, dates, split-value normalization) — log every
  decision in the Import Report.

**Chosen:** (b).

**Why:** Real CSVs from real spreadsheets are rarely perfectly clean; (a) would mean
one bad row blocks 100 good ones. (b) maximizes useful data imported while making
every automatic decision visible and auditable via the Import Report — which is also
an explicit deliverable for this assignment.

---

### D9. Duplicate-row definition
**Options considered:**
- (a) Treat any two rows with the same `description` as duplicates.
- (b) Treat rows as duplicates only if `description` + `amount` + `paid_by_email` +
  `expense_date` all match exactly.

**Chosen:** (b).

**Why:** (a) would incorrectly flag legitimately recurring expenses (e.g. "Groceries"
logged weekly) as duplicates. (b) only catches true copy-paste duplicates — the same
expense entered twice — while allowing recurring expenses with different dates or
amounts.

---

### D10. Repo commit structure
**Options considered:**
- (a) One bulk commit with the entire codebase (as the first pass effectively was).
- (b) A sequence of incremental, scoped commits mirroring the actual build order:
  schema → auth/groups → expenses/splits → balances/settlements → chat → CSV import
  → UI redesign → docs.

**Chosen:** (b).

**Why:** The updated assignment explicitly flags "a single bulk commit" as a red
flag, and a scoped history is also genuinely more useful for the "another evaluator
recreates your app from AI_CONTEXT.md" exercise — it shows the dependency order
(schema before features, features before UI polish, etc.).

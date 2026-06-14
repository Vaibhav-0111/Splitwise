# AI_USAGE.md — AI Tooling, Prompts, and Documented Mistakes

## AI tools used
- **Claude (Anthropic, Claude Sonnet 4.6)** — primary development collaborator for
  the entire project: schema design, RLS policies, RPC functions, full Next.js
  frontend, CSV import/anomaly-detection pipeline, UI redesign, and all
  documentation (`AI_CONTEXT.md`, `BUILD_PLAN.md`, `SCOPE.md`, `DECISIONS.md`, this
  file).
- **"UI/UX Pro Max" community skill** (github.com/nextlevelbuilder/ui-ux-pro-max-skill)
  — used via its `search.py --design-system` generator to produce the design tokens
  (palette, typography, component patterns) applied in the UI redesign. Cloned and
  run inside Claude's sandbox.

## Key prompts used
See `PROMPTS.md` for the full list (required initial prompt, "build whole project"
overrides, etc.). The most consequential prompts for this revision were:

1. *"Apply the UI/UX Pro Max skill to generate a tailored design system... and
   rebuild the UI to match"* → produced the dark "Accessible & Ethical" dashboard
   theme (amber/purple/Fira Sans) now used throughout the app.
2. *"Build the CSV import pipeline with anomaly detection... producing the in-app
   Import Report"* → produced `src/lib/csvImport.ts`, the import UI, the
   `import_reports` table, and `sample-data/expenses_import_sample.csv`.
3. *"Write SCOPE.md / DECISIONS.md / AI_USAGE.md..."* → produced this set of docs,
   including the retrospective fix described in Case 3 below.

---

## Three documented cases where the AI produced something wrong

### Case 1 — Incorrect/placeholder SQL in `get_group_pairwise_balances`
**What happened:** While writing the initial schema migration, the first draft of
the pairwise-balance RPC included a CTE with the condition:
```sql
where a.debtor < a.creditor or a.debtor > a.creditor
```
This is a tautology (always true except when equal, which can't happen) — it was a
leftover placeholder from an incomplete dedup approach, and the surrounding logic
would have emitted **both directions of each pair** (e.g. "A owes B $X" *and*
"B owes A $Y" as separate unreconciled rows) instead of a single netted balance.

**How it was caught:** Caught immediately during a self-review pass right after
writing the file — re-reading the CTE chain, the placeholder condition and the
mirrored-row output were visually obvious as not matching the intended
"one row per pair, netted" output described in the same function's doc comment.

**What was changed:** Rewrote the CTE chain to collapse each unordered pair {A,B}
into a single signed `net` value using `least()`/`greatest()` on the two user ids,
then derive debtor/creditor from the sign of `net`. See
`supabase/migrations/0001_init.sql`, function `get_group_pairwise_balances`, the
`netted` CTE.

---

### Case 2 — Used a Next.js version with a known security vulnerability
**What happened:** The initial `package.json` pinned `"next": "14.2.15"`. After
`npm install`, npm printed:
```
npm warn deprecated next@14.2.15: This version has a security vulnerability.
Please upgrade to a patched version.
```
(1 moderate + 1 critical vulnerability reported by `npm audit`.)

**How it was caught:** Read the `npm install` output rather than ignoring warnings —
the deprecation/security warning was printed directly in the install log.

**What was changed:** Queried `npm view next versions` to find the latest patched
14.x release (`14.2.35`), updated `package.json`, reinstalled, and re-ran
`next build` to confirm the app still builds cleanly on the patched version.

---

### Case 3 — N+1 query pattern on the groups list page
**What happened:** The groups list page (`src/app/groups/page.tsx`) originally
computed each group's balance with:
```ts
for (const g of groups) {
  const { data } = await supabase.rpc("get_group_balances", { p_group_id: g.id });
  ...
}
```
This issues one network round-trip **per group** the user belongs to — fine for a
demo with 1-2 groups, but a classic N+1 pattern that degrades linearly as a user
joins more groups, and is exactly the kind of thing that looks fine in a quick demo
but is a red flag in a code review.

**How it was caught:** While writing `AI_USAGE.md` and thinking through "what's a
concrete mistake I can point to," a review of the groups list page surfaced this
pattern as a clear example — it had been written for clarity/speed during the
initial build pass without considering the per-group round-trip cost.

**What was changed:** Replaced the per-group RPC loop with **4 batched queries**
(total, independent of group count) — one each for: expenses paid by the user across
all their groups, expense_splits owed by the user across all groups, settlements
received, and settlements paid — each filtered with `.in("group_id", groupIds)`, then
aggregated client-side in a single pass over the results. See
`src/app/groups/page.tsx`.

---

## Process notes
- All three cases above were caught through **direct code/log review**, not through
  running the app end-to-end against a live Supabase project (which requires
  credentials the AI doesn't have). This is a known limitation of this development
  process — see `AI_CONTEXT.md` §9 (Testing Plan) for the manual test plan that
  should be run against a real deployment to catch issues these review passes can't.
- The project was built and verified with `npm run build` after each major change to
  catch TypeScript/compile errors immediately.

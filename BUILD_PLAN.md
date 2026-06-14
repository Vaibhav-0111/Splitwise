# BUILD_PLAN.md — Splitsy (Splitwise Clone)

## 1. Product Research

### How Splitwise was studied
Splitwise's product behavior was reverse-engineered from general product knowledge of
its core loop: groups → expenses → splits → balances → settle up, plus its well-known
support for multiple split types (equal, exact amounts, percentages, and shares) and
its per-expense comment thread.

### Workflows identified
1. **Onboarding**: sign up → land on an empty groups list → create first group.
2. **Group setup**: create group → invite members (by email) → group becomes a shared
   ledger.
3. **Expense logging**: any member can log an expense, choose who paid, choose how
   it's split (4 strategies), and the system immediately recalculates balances.
4. **Balance checking**: members check "who owes whom" both at a pairwise level and
   their own overall net position in the group.
5. **Settling up**: when someone pays back what they owe (outside the app, e.g. cash
   or Venmo), they record it so balances reflect reality.
6. **Discussion**: comment threads attached to individual expenses for clarifying
   details ("did you include the tip?").

### Product assumptions made
- Splitting is always evaluated **within a single group** — no cross-group or
  friend-level balances (Splitwise has both; we scoped to group-only for the MVP).
- "Settle up" is a manual bookkeeping action, not a real payment integration.
- A user must have an account before being added to a group (no pending email
  invites for non-users).
- Currency is USD-only for this version.

---

## 2. Architecture

### Tech stack
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend/DB**: Supabase (Postgres + Auth + Realtime + Row Level Security)
- **Hosting**: Vercel (app) + Supabase (DB/Auth/Realtime)

### Database schema
See `AI_CONTEXT.md` §4 for full schema. Summary: `profiles`, `groups`,
`group_members`, `expenses`, `expense_splits`, `expense_messages`, `settlements` —
all relational tables in Postgres, secured with RLS, plus 3 Postgres functions
(`create_expense_with_splits`, `get_group_balances`, `get_group_pairwise_balances`).

### API design
No separate REST API — Supabase JS client used directly from Next.js server and
client components, with authorization enforced entirely via Postgres RLS policies.
See `AI_CONTEXT.md` §5 for the full call mapping.

### Frontend structure
Next.js App Router with routes for auth (`/login`, `/signup`), groups list
(`/groups`), group detail (`/groups/[groupId]`), add expense
(`/groups/[groupId]/expenses/new`), expense detail + chat
(`/groups/[groupId]/expenses/[expenseId]`), and settle up
(`/groups/[groupId]/settle`). See `AI_CONTEXT.md` §6 for the full tree.

### Deployment approach
1. Push this repo to GitHub.
2. Create a Supabase project, run `supabase/migrations/0001_init.sql`.
3. Disable email confirmation in Supabase Auth settings (for frictionless demo
   signup), or confirm via email.
4. Import the repo into Vercel, set `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars, deploy.

---

## 3. AI Collaboration Process

### How the AI was instructed
The project began with the standard "junior engineer / interviewer" prompt (per the
assignment's required initial prompt), with the explicit instruction not to assume
requirements and to interview before building.

### What happened in practice
Given the compressed timeline, the developer made the foundational product and
architecture decisions directly (documented in `AI_CONTEXT.md` §2–3) rather than
going through a full multi-round interview, and instructed the AI to proceed with
those defaults — explicitly stating each assumption so it could be reviewed,
challenged, and corrected.

### How the plan evolved
- Initial schema draft included a "pending invite" mechanism for inviting users by
  email who hadn't signed up yet — descoped to "must already have an account" to fit
  the timeline.
- Balance calculation initially considered a multi-hop debt-simplification graph
  (Splitwise's actual behavior) — descoped to direct pairwise netting for
  simplicity and explainability.
- `expense_splits.amount` was deliberately normalized to a dollar value regardless of
  split_type (rather than storing only percentages/shares and computing amounts at
  query time), to keep the two balance RPC functions simple and split-type-agnostic.

### How AI_CONTEXT.md was maintained
`AI_CONTEXT.md` was written as the schema, RLS policies, RPC functions, and frontend
structure were finalized, capturing the *final* state plus the *reasoning* behind key
decisions (§3, §4, §7, §10) so the document is sufficient on its own to regenerate an
equivalent app.

---

## 4. Tradeoffs

### What was simplified
- Direct pairwise balance netting instead of multi-hop debt simplification.
- Manual settlement recording instead of payment gateway integration.
- Single currency (USD).

### What was hardcoded
- Currency = "USD" in the UI (column exists in schema for future use).
- Split percentages/shares stored for display only; dollar `amount` is canonical.

### What was avoided
- A separate backend API server (Express/FastAPI/etc.) — Supabase + RLS covers the
  "relational DB only" requirement and the auth/realtime requirements without
  additional infrastructure.
- Email-based pending invites for non-users.
- Automated test suite (manual test plan documented in `AI_CONTEXT.md` §9 instead).

### What would improve with more time
- Multi-hop debt simplification algorithm.
- Expense editing (with recalculation safeguards).
- Multi-currency support with conversion.
- Automated tests (unit tests for split-calculation logic; integration tests for RLS
  policies).
- Pending email invites for users without accounts.
- Notifications (in-app and/or email) when added to a group or when a new expense
  affects your balance.
- Group ownership transfer / multiple owners.

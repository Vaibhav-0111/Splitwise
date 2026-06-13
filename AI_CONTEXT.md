# AI_CONTEXT.md — Splitsy (Splitwise Clone)

This file is the **single source of truth** for this project. It captures product
understanding, scope, architecture, schema, API design, frontend structure, decisions
made, tradeoffs, and known limitations — sufficient for another developer or AI agent
to rebuild a similar app from this document alone.

---

## 1. Product Understanding

### What is Splitwise?
Splitwise is a shared-expense tracking app. Groups of people (roommates, trip groups,
couples) log shared expenses, the app calculates who owes whom, and members can
"settle up" by recording payments. Core loop:

1. A user creates or joins a **group**.
2. Members log **expenses** paid by one person, split among some/all members.
3. The app continuously computes **balances** (who owes whom, and how much).
4. Members **settle up** by recording a payment, which reduces the outstanding balance.
5. Members can discuss an expense via comments (clarify "what was this for?", "did
   everyone get a slice?", etc.)

### Core entities (from product research)
- **User** — has an identity, can belong to many groups.
- **Group** — a named collection of users sharing expenses (e.g. "Goa Trip 2026").
- **Expense** — an amount paid by one user, split among a subset of group members
  using one of several split strategies.
- **Split** — the per-user share of an expense (always normalized to a dollar amount
  for balance math, regardless of how it was entered).
- **Settlement** — a record that one user paid another a specific amount (manual
  bookkeeping, no real money movement).
- **Comment/Message** — chat thread attached to a specific expense.

---

## 2. Product Scope

### In scope (MVP, built)
1. **Auth** — email/password signup & login (Supabase Auth).
2. **Groups** — create group, view groups you belong to, add/remove members by email,
   see member list with owner/member roles.
3. **Expenses** — create expense with description, amount, payer, and split type:
   - **Equal** — divided evenly among selected participants.
   - **Unequal** — exact dollar amount per participant (must sum to total).
   - **Percentage** — % per participant (must sum to 100%).
   - **Shares** — relative share count per participant (e.g. 2 shares vs 1 share).
4. **Balances**:
   - Per-pair "who owes whom" (netted, one direction per pair).
   - Per-user net balance within a group (positive = owed money, negative = owes money).
5. **Settlements** — record a payment from one member to another with an optional note;
   history is shown on the Settle Up page.
6. **Expense chat** — real-time comment thread on each expense (Supabase Realtime).
7. **Relational DB** — Postgres (via Supabase), fully normalized schema, RLS-secured.

### Out of scope (explicitly, documented for evaluators)
- Multi-currency support (everything is USD; `currency` column exists for future use
  but the UI hardcodes "USD").
- Recurring/scheduled expenses.
- Receipt photo uploads / attachments.
- Push notifications / email notifications.
- Friend-to-friend balances outside of a group context.
- Multi-hop debt simplification graph algorithm (e.g. "A owes B, B owes C" →
  simplify to "A owes C"). We implement **direct pairwise netting only**: if A owes B
  $10 and B owes A $4 from different expenses, we net to "A owes B $6", but we do not
  simplify across three or more people.
- Pending invites for users who don't yet have an account — "add member" requires the
  invitee to already have signed up (looked up by email).
- Editing an existing expense (only create + delete are supported).
- Group deletion / leaving a group (members can be removed by the owner; users can
  remove themselves).

---

## 3. Engineering Requirements & Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router, TypeScript) | Single deployable repo, server components for data fetching, easy Vercel deploy |
| Styling | Tailwind CSS | Fast to build clean UI within the timeline |
| Backend | Supabase (Postgres + Auth + Realtime + RLS) | Relational DB requirement satisfied natively; Auth + Realtime solve login and chat without extra services |
| DB | Postgres (Supabase-managed) | Required: "Use relational DBs only" |
| Real-time chat | Supabase Realtime (`postgres_changes` on `expense_messages`) | Native Postgres LISTEN/NOTIFY-based realtime, no extra infra |
| Hosting | Vercel (frontend) + Supabase (DB/Auth) | Free tiers, fast deploy, matches "public deployed app URL" requirement |
| Auth method | Supabase email/password | Simplest to implement and demo within 2 days |

### Why Supabase specifically?
- Gives us Postgres (relational requirement) + Auth + Realtime + Row Level Security
  in one managed service, avoiding building a separate Express/Node API server.
- The Next.js app talks to Supabase directly from server components (using the
  user's session) and from client components (for interactive forms + realtime),
  with **all authorization enforced via Postgres RLS policies** — not application code.
- Two RPC functions (Postgres functions) encapsulate logic that must be transactional
  or aggregate-heavy: `create_expense_with_splits` and balance calculations
  (`get_group_balances`, `get_group_pairwise_balances`).

---

## 4. Database Schema

File: `supabase/migrations/0001_init.sql` (run this in the Supabase SQL editor or via
`supabase db push`).

### Tables

**`profiles`** (1:1 with `auth.users`, auto-created via trigger on signup)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | = auth.users.id |
| email | text unique | |
| display_name | text | from signup form, falls back to email prefix |
| avatar_url | text null | unused in MVP UI |
| created_at | timestamptz | |

**`groups`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| created_by | uuid → profiles | |
| created_at | timestamptz | |

**`group_members`** (join table, group ↔ user)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| group_id | uuid → groups | cascade delete |
| user_id | uuid → profiles | cascade delete |
| role | text | `'owner'` \| `'member'`, unique per (group_id, user_id) |
| joined_at | timestamptz | |

**`expenses`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| group_id | uuid → groups | cascade delete |
| description | text | |
| amount | numeric(12,2) | > 0 |
| currency | text | default `'USD'` |
| paid_by | uuid → profiles | who fronted the money |
| created_by | uuid → profiles | who logged the expense (may differ from payer) |
| split_type | text | `'equal' \| 'unequal' \| 'percentage' \| 'shares'` |
| created_at, updated_at | timestamptz | |

**`expense_splits`** (one row per participant per expense)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| expense_id | uuid → expenses | cascade delete |
| user_id | uuid → profiles | |
| amount | numeric(12,2) | **always the final dollar amount owed**, regardless of split_type — this is the key design decision that keeps balance math simple |
| percentage | numeric(5,2) null | only populated when split_type = 'percentage', for display/edit |
| shares | numeric(8,2) null | only populated when split_type = 'shares', for display/edit |

> **Design decision**: `expense_splits.amount` is always normalized to dollars at
> write time (computed client-side, validated server-side via the RPC). This means
> balance queries never need to know the split_type — they just sum `amount`.
> `percentage`/`shares` are stored purely for UI display ("Alice paid 30% / 2 shares").

**`expense_messages`** (chat, one row per message)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| expense_id | uuid → expenses | cascade delete |
| user_id | uuid → profiles | |
| message | text | |
| created_at | timestamptz | |

**`settlements`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| group_id | uuid → groups | cascade delete |
| from_user | uuid → profiles | who paid |
| to_user | uuid → profiles | who received |
| amount | numeric(12,2) | > 0 |
| note | text null | |
| created_at | timestamptz | |
| | | CHECK (from_user <> to_user) |

### Row Level Security (RLS)
All tables have RLS enabled. Core rule, implemented via `is_group_member(group_id, user_id)`
helper function: **a user can only see/modify data belonging to groups they are a
member of.** Specifics:
- `profiles`: any authenticated user can SELECT all profiles (needed to look up users
  by email when inviting to a group, and to render names everywhere). Users can only
  UPDATE their own profile.
- `groups`: SELECT only if member; INSERT allowed if `created_by = auth.uid()`; UPDATE
  restricted to owners.
- `group_members`: SELECT only if member of that group. INSERT allowed if you're
  adding yourself, or you're already a member (covers "owner adds someone"). DELETE
  allowed if removing yourself, or you're the group owner.
- `expenses`, `expense_splits`, `expense_messages`, `settlements`: SELECT/INSERT
  gated on membership in the parent group (via joins back to `expenses`/`groups`).
  Expense DELETE restricted to `created_by`.

### RPC Functions
- **`create_expense_with_splits(group_id, description, amount, currency, paid_by,
  split_type, splits jsonb)`** — atomically inserts an `expenses` row and all
  `expense_splits` rows in one transaction. `splits` is a JSON array of
  `{user_id, amount, percentage, shares}`. Raises an exception if the caller isn't a
  group member (defense in depth alongside RLS).
- **`get_group_balances(group_id)`** — returns `(user_id, display_name, net_balance)`
  per member. `net_balance = total_paid - total_owed + settlements_received -
  settlements_paid`. Positive = the group owes them; negative = they owe the group.
- **`get_group_pairwise_balances(group_id)`** — returns `(debtor, debtor_name,
  creditor, creditor_name, amount)` rows, one per pair with a non-zero net balance.
  Computed by: (1) for every expense split, the participant "owes" the payer their
  split amount; (2) settlements are treated as debt in the reverse direction; (3) all
  debts between each unordered pair {A,B} are netted into a single signed value, then
  expressed as "X owes Y $amount" (only emitted if non-zero).

---

## 5. API Design

This project does **not** have a separate REST/GraphQL API layer. Data access is via
the Supabase JS client (`@supabase/supabase-js` through `@supabase/ssr`), called
directly from:
- **Server Components** (read-heavy pages: groups list, group detail, expense detail,
  settle page) — using a server-side Supabase client that reads the user's session
  from cookies.
- **Client Components** (forms/mutations: create group, add member, create expense,
  record settlement, send chat message) — using a browser Supabase client, so RLS
  is enforced using the logged-in user's JWT.

"Endpoints" used (Supabase table/RPC names act as the API surface):
| Operation | Supabase call |
|---|---|
| Sign up | `supabase.auth.signUp({ email, password, options: { data: { display_name }}})` |
| Log in | `supabase.auth.signInWithPassword({ email, password })` |
| Log out | `supabase.auth.signOut()` |
| List my groups | `from('group_members').select('group_id, groups(...)').eq('user_id', uid)` |
| Create group | `from('groups').insert(...)` then `from('group_members').insert({role:'owner'})` |
| List members | `from('group_members').select('...,profiles(...)').eq('group_id', id)` |
| Add member by email | `from('profiles').select('id').eq('email', email)` → `from('group_members').insert(...)` |
| Remove member | `from('group_members').delete().eq('group_id',..).eq('user_id',..)` |
| Create expense + splits | `rpc('create_expense_with_splits', {...})` |
| List expenses | `from('expenses').select('...,payer:profiles!expenses_paid_by_fkey(...)')` |
| Expense detail + splits | `from('expense_splits').select('...,profiles(...)')` |
| Net balances | `rpc('get_group_balances', { p_group_id })` |
| Pairwise balances | `rpc('get_group_pairwise_balances', { p_group_id })` |
| Record settlement | `from('settlements').insert(...)` |
| Send chat message | `from('expense_messages').insert(...)` |
| Realtime chat | `supabase.channel(...).on('postgres_changes', { event: 'INSERT', table: 'expense_messages', filter: 'expense_id=eq...' })` |

---

## 6. Frontend Structure (Next.js App Router)

```
src/
  middleware.ts                 — auth guard: redirects unauth'd users to /login,
                                   redirects logged-in users away from /login & /signup
  app/
    layout.tsx, globals.css     — root layout, Tailwind base
    page.tsx                    — redirects to /groups or /login based on session
    login/page.tsx              — email/password login form
    signup/page.tsx             — signup form (name, email, password)
    groups/
      page.tsx                  — list of user's groups + per-group net balance + "New group"
      [groupId]/
        page.tsx                — group detail: members, pairwise balances, net balances,
                                   expense list, links to "Add expense" / "Settle up"
        expenses/
          new/page.tsx          — add expense form (server: fetch members; client: form)
          [expenseId]/page.tsx  — expense detail: breakdown + realtime chat
        settle/page.tsx         — outstanding balances, record-payment form, payment history
  components/
    NavBar.tsx                  — top nav + sign out
    CreateGroupForm.tsx
    AddMemberForm.tsx
    RemoveMemberButton.tsx
    AddExpenseForm.tsx          — handles all 4 split types + live preview
    ExpenseChat.tsx             — realtime chat via Supabase channel
    SettleUpForm.tsx
    DeleteExpenseButton.tsx
  lib/
    types.ts                    — shared TypeScript types mirroring DB schema
    supabase/client.ts          — browser client (createBrowserClient)
    supabase/server.ts          — server client (createServerClient, cookie-based)
```

### Routing
Standard Next.js file-based routing. All `/groups/*` routes are protected by
`middleware.ts`. No client-side route guards needed — middleware handles redirects
at the edge before any page renders.

---

## 7. Split Calculation Logic (Frontend)

Implemented in `AddExpenseForm.tsx`:
- **Equal**: `amount / numParticipants` for each selected participant.
- **Unequal**: user enters a dollar amount per participant; validated to sum to the
  total (±$0.01 tolerance for rounding).
- **Percentage**: user enters % per participant; validated to sum to 100% (±0.1
  tolerance); dollar amount = `total * pct / 100`.
- **Shares**: user enters a share count per participant (e.g. 1, 2, 0.5); dollar
  amount = `total * shares / sum(all shares)`.

After computing, all amounts are rounded to 2 decimals, and any rounding drift
(due to division) is absorbed into the **last participant's** amount so the splits
always sum exactly to the total. This final array of `{user_id, amount, percentage,
shares}` is passed to `create_expense_with_splits`.

---

## 8. Deployment Plan

1. **Supabase**: create a project → run `supabase/migrations/0001_init.sql` in the SQL
   editor → (recommended for fast demo) disable "Confirm email" under
   Authentication → Providers → Email, so signup logs the user in immediately →
   copy Project URL + anon key.
2. **Vercel**: import this repo → set env vars `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` → deploy. Next.js detects the framework
   automatically.
3. No other infrastructure needed — Realtime is enabled by default on the
   `expense_messages` table via Supabase's `supabase_realtime` publication (Supabase
   enables this by default for new tables created via SQL editor in most projects;
   if chat doesn't update live, enable Realtime for `expense_messages` in
   Database → Replication).

---

## 9. Testing Plan

Given the 2-day scope, testing is **manual/exploratory**, covering:
1. Sign up two separate users (e.g. Alice, Bob) in two browser sessions.
2. Alice creates a group, adds Bob by email.
3. Alice logs an equal-split expense ($100, both participants) → verify Bob owes
   Alice $50 on the group page and in pairwise balances.
4. Bob logs an unequal-split expense, then a percentage-split, then a shares-split →
   verify breakdowns and net balances update correctly after each.
5. Open the same expense in both sessions, send chat messages from both → verify
   real-time delivery without refresh.
6. Bob records a settlement paying Alice $20 → verify pairwise balance decreases by $20.
7. Alice removes Bob from the group (as owner) → verify Bob loses access (RLS).
8. Attempt to access a group's data while not a member (different account) → verify
   it 404s / returns nothing (RLS enforcement).

No automated test suite was built due to time constraints (documented as a known
limitation / future improvement).

---

## 10. Tradeoffs & Simplifications

- **No multi-hop debt simplification** — only direct pairwise netting. Simpler to
  implement, test, and explain; matches what most users actually want to see
  ("what do I owe this specific person").
- **expense_splits.amount is the source of truth** for balances, computed client-side
  before the RPC call. This trades a small amount of client-side trust for a much
  simpler schema and balance query — acceptable for an MVP without adversarial users.
- **Add member by email requires an existing account** — avoids building an email
  invitation/pending-member system within the timeline.
- **USD only** — `currency` column exists in the schema for future extensibility but
  the UI hardcodes "USD".
- **No expense editing** — only create/delete, to avoid the complexity of re-splitting
  + recalculating an edited expense's splits and any settlements that may have been
  recorded against the old amounts.
- **Supabase as combined backend** — avoids writing/hosting a separate API server,
  letting all effort go toward product logic and schema correctness (the parts being
  evaluated).

---

## 11. Known Limitations

- Email confirmation must be disabled in Supabase (or users must confirm via email
  before first login) — not configurable from the app UI.
- Removing a user from a group does **not** retroactively remove their historical
  expense_splits or settlements — their balance history remains for accounting
  accuracy, but they can no longer view or interact with the group.
- No pagination on expense lists or chat — fine for demo-scale data, would need
  addressing for groups with hundreds of expenses/messages.
- No automated tests.
- No rate limiting on chat messages.
- Group owner cannot transfer ownership or have multiple owners.

---

## 12. Change Log

- **v1 (initial build)**: Full schema, RLS, RPC functions, auth, groups, members,
  expenses with all 4 split types, pairwise + net balances, settlements, realtime
  expense chat. Built in a single pass based on the scope decisions documented above
  (made by the developer directly, given the compressed timeline — see BUILD_PLAN.md
  for the AI collaboration process).

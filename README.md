# Splitsy — A Simplified Splitwise Clone

A group expense-sharing app: create groups, log expenses split equally, unequally, by
percentage, or by shares, see who owes whom, chat on each expense in real time, and
record settlements.

Built with **Next.js 14 (App Router, TypeScript, Tailwind)** + **Supabase** (Postgres,
Auth, Realtime, Row Level Security).

**AI used**: This project was built with **Claude** (Anthropic) as the primary
development collaborator. See `AI_CONTEXT.md` and `BUILD_PLAN.md` for the full product
and engineering context, and `PROMPTS.md` for key prompts used.

---

## Features

- **Auth** — email/password signup & login
- **Groups** — create groups, add/remove members by email
- **Expenses** — log expenses with 4 split types: equal, unequal (exact amounts),
  percentage, and shares
- **Balances** — pairwise "who owes whom" and per-user net balance per group
- **Settle up** — record payments between members, with history
- **Expense chat** — real-time discussion thread on each expense
- **CSV import** — bulk-import historical expenses from a CSV, with full anomaly
  detection (missing fields, duplicates, unknown users, mismatched/invalid splits,
  unsupported currency, bad dates) and an in-app Import Report
- **Dark dashboard UI** — design system generated via the "UI/UX Pro Max" skill
  (amber/purple palette, Fira Sans/Fira Code typography)

---

## Documentation

| File | Contents |
|---|---|
| `AI_CONTEXT.md` | Full product/engineering source of truth |
| `BUILD_PLAN.md` | Research, architecture, AI collaboration process, tradeoffs |
| `SCOPE.md` | CSV import anomaly log + finalized DB schema |
| `DECISIONS.md` | Decision log — options considered & rationale, per decision |
| `AI_USAGE.md` | AI tools used, key prompts, and 3 documented AI mistakes + fixes |
| `PROMPTS.md` | Key prompts used during development |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | Supabase (Postgres, Auth, Realtime, RLS) |
| Hosting | Vercel (app) + Supabase (DB) |

---

## Local Setup

### 1. Prerequisites
- Node.js 18+
- A free [Supabase](https://supabase.com) account
- A free [Vercel](https://vercel.com) account (for deployment)

### 2. Clone & install

```bash
git clone <your-repo-url>
cd splitwise-clone
npm install
```

### 3. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project.
2. Once created, open the **SQL Editor** and run the contents of
   `supabase/migrations/0001_init.sql`. This creates all tables, RLS policies, and
   helper functions/RPCs.
3. Go to **Authentication → Providers → Email** and **turn OFF "Confirm email"**
   (recommended for fast demo/testing — users are logged in immediately after
   signup). If you leave it on, users must click the confirmation link in their
   email before they can log in.
4. Go to **Project Settings → API** and copy:
   - `Project URL`
   - `anon` `public` key

### 4. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in your Supabase values:

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

### 5. Run locally

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

---

## Deploying

### Supabase
Already done in step 3 above — Supabase is your hosted Postgres + Auth + Realtime
backend, no further deployment needed.

> **Realtime**: the `expense_messages` table needs Realtime enabled for the chat
> feature to update live. In most Supabase projects, tables created via the SQL
> editor are automatically added to the `supabase_realtime` publication. If chat
> messages don't appear live for other users, go to **Database → Replication** and
> ensure `expense_messages` is enabled.

### Vercel
1. Push this repo to GitHub.
2. In Vercel, click **Add New → Project**, import the repo.
3. Vercel auto-detects Next.js. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click **Deploy**.

Your app will be live at `https://your-project.vercel.app`.

---

## Trying it out

1. Sign up two accounts (e.g. `alice@example.com`, `bob@example.com`) — use two
   browser windows / incognito tabs.
2. As Alice, create a group (e.g. "Roommates") and add Bob by email.
3. Log an expense — e.g. "Groceries", $60, paid by Alice, split equally between
   Alice and Bob.
4. Check the group page — Bob now owes Alice $30.
5. Open the expense and chat between the two accounts — messages appear in real time.
6. Try unequal/percentage/shares splits on other expenses.
7. Go to **Settle up** and record Bob paying Alice $30 — the balance clears.
8. Go to **Import CSV** on the group page, upload
   `sample-data/expenses_import_sample.csv`, and review the Import Report — it
   demonstrates every anomaly type (missing fields, duplicates, unknown users,
   normalized splits, etc.). See `SCOPE.md` for a row-by-row breakdown of what to
   expect.

---

## Project Structure

```
src/
  middleware.ts            — auth-protected routes
  app/
    page.tsx                — redirects based on session
    login/, signup/         — auth pages
    groups/                 — groups list, group detail, expenses, settle up
  components/                — forms, chat, nav
  lib/
    types.ts                — shared TypeScript types
    supabase/                — Supabase client helpers (browser + server)
supabase/
  migrations/0001_init.sql  — full DB schema, RLS policies, RPC functions
AI_CONTEXT.md                — full product/engineering context (source of truth)
BUILD_PLAN.md                — research, architecture, AI collaboration, tradeoffs
PROMPTS.md                   — key prompts used during development
```

---

## Known Limitations

See `AI_CONTEXT.md` §11 for the full list. Highlights: USD-only, no expense editing,
no multi-hop debt simplification (direct pairwise balances only), members must have
an existing account to be added to a group.

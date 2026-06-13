# PROMPTS.md — Key Prompts Used

This file records the key prompts used with the AI tool (Claude) during this project,
per the assignment's deliverable requirements.

## 1. Required initial prompt (per assignment instructions)

> "You are a junior engineer helping me complete an internship assignment. The
> assignment is to reverse engineer Splitwise, scope a realistic version, and build a
> working deployed app. Important instructions: 1. Do not assume product
> requirements. 2. Do not jump directly into implementation. 3. Ask me detailed
> questions about product scope, UX, workflows, edge cases, and engineering
> decisions... [full prompt as specified in the assignment brief]"

**Outcome**: The AI offered a structured interview (tech stack, database, real-time
chat approach, auth, MVP scope boundaries, invite flow, settlement model, balance
calculation approach — 8 questions across product and engineering decisions).

## 2. Override: "build whole project"

> "build whole project" (repeated)

**Outcome**: Given the timeline, the developer instructed the AI to proceed directly
to implementation, making the foundational decisions itself and documenting each one
explicitly in `AI_CONTEXT.md` so they could be reviewed/corrected rather than
discovered later. The AI:
- Chose Next.js 14 + Supabase (Postgres/Auth/Realtime/RLS) as the stack.
- Designed and wrote the full relational schema with RLS policies and RPC functions
  (`supabase/migrations/0001_init.sql`).
- Built the complete frontend: auth pages, groups list/detail, add-expense form
  supporting all 4 split types with live preview, expense detail with real-time chat,
  and settle-up flow.
- Documented every default decision, scope boundary, and tradeoff in `AI_CONTEXT.md`
  and `BUILD_PLAN.md`.
- Ran `npm install` and `next build` to verify the project compiles successfully.

## 3. Follow-up corrections during build

During schema design, an initial draft of `get_group_pairwise_balances` had a
redundant/incorrect netting filter. This was caught and rewritten to a correct
"collapse each unordered pair into a single signed net amount" approach (see
`supabase/migrations/0001_init.sql`).

---

## Notes for evaluators

This document, combined with `AI_CONTEXT.md`, should allow another developer or AI
agent to reconstruct an equivalent app: start from the required initial prompt, then
apply the decisions documented in `AI_CONTEXT.md` §2–3 (scope) and §3 (tech stack) as
the "answers" to the interview, and follow the schema/API/frontend structure in
`AI_CONTEXT.md` §4–7.

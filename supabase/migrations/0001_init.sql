-- ============================================================
-- Splitwise Clone — Initial Schema
-- Relational DB (Postgres via Supabase)
-- ============================================================

-- ------------------------------------------------------------
-- PROFILES
-- One row per auth user. Created automatically via trigger.
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ------------------------------------------------------------
-- GROUPS
-- ------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- GROUP MEMBERS
-- ------------------------------------------------------------
create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

-- ------------------------------------------------------------
-- EXPENSES
-- split_type determines how expense_splits rows were derived
-- ------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'USD',
  paid_by uuid not null references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  split_type text not null check (split_type in ('equal', 'unequal', 'percentage', 'shares')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- EXPENSE SPLITS
-- One row per participant per expense. `amount` is always the
-- final computed dollar amount owed by that user for this
-- expense (regardless of split_type), so balance math is simple.
-- percentage / shares are stored for display/edit purposes only.
-- ------------------------------------------------------------
create table public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  amount numeric(12, 2) not null check (amount >= 0),
  percentage numeric(5, 2),
  shares numeric(8, 2),
  unique (expense_id, user_id)
);

-- ------------------------------------------------------------
-- EXPENSE MESSAGES (chat on an expense, real-time via Supabase Realtime)
-- ------------------------------------------------------------
create table public.expense_messages (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  message text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- SETTLEMENTS (manual "record payment" bookkeeping entries)
-- from_user paid to_user the given amount
-- ------------------------------------------------------------
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  from_user uuid not null references public.profiles(id),
  to_user uuid not null references public.profiles(id),
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------
create index idx_group_members_group on public.group_members(group_id);
create index idx_group_members_user on public.group_members(user_id);
create index idx_expenses_group on public.expenses(group_id);
create index idx_expense_splits_expense on public.expense_splits(expense_id);
create index idx_expense_splits_user on public.expense_splits(user_id);
create index idx_expense_messages_expense on public.expense_messages(expense_id);
create index idx_settlements_group on public.settlements(group_id);


-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Is the given user a member of the given group?
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$ language sql security definer stable;


-- ============================================================
-- RLS POLICIES
-- ============================================================
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.expense_messages enable row level security;
alter table public.settlements enable row level security;

-- PROFILES: anyone authenticated can read profiles (needed to look up
-- users by email when inviting, and to display names everywhere).
create policy "profiles_select_all" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- GROUPS: members can view; any authenticated user can create a group
-- (they become owner via group_members insert immediately after).
create policy "groups_select_member" on public.groups
  for select using (public.is_group_member(id, auth.uid()));

create policy "groups_insert_any_auth" on public.groups
  for insert with check (auth.uid() = created_by);

create policy "groups_update_owner" on public.groups
  for update using (
    exists (
      select 1 from public.group_members
      where group_id = id and user_id = auth.uid() and role = 'owner'
    )
  );

-- GROUP MEMBERS: members can view membership of their groups.
create policy "group_members_select_member" on public.group_members
  for select using (public.is_group_member(group_id, auth.uid()));

-- Insert: a user can add themselves (e.g. on group creation),
-- OR an existing owner/member can add someone else.
create policy "group_members_insert" on public.group_members
  for insert with check (
    user_id = auth.uid()
    or public.is_group_member(group_id, auth.uid())
  );

-- Delete: owners can remove members, or a member can remove themselves.
create policy "group_members_delete" on public.group_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = group_members.group_id
        and gm.user_id = auth.uid() and gm.role = 'owner'
    )
  );

-- EXPENSES: members of the group can view/insert.
create policy "expenses_select_member" on public.expenses
  for select using (public.is_group_member(group_id, auth.uid()));

create policy "expenses_insert_member" on public.expenses
  for insert with check (public.is_group_member(group_id, auth.uid()));

create policy "expenses_update_member" on public.expenses
  for update using (public.is_group_member(group_id, auth.uid()));

create policy "expenses_delete_creator" on public.expenses
  for delete using (created_by = auth.uid());

-- EXPENSE SPLITS: visible/insertable if you're a member of the parent group.
create policy "expense_splits_select_member" on public.expense_splits
  for select using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id, auth.uid())
    )
  );

create policy "expense_splits_insert_member" on public.expense_splits
  for insert with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id, auth.uid())
    )
  );

create policy "expense_splits_delete_member" on public.expense_splits
  for delete using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id, auth.uid())
    )
  );

-- EXPENSE MESSAGES (chat): members of the parent expense's group.
create policy "expense_messages_select_member" on public.expense_messages
  for select using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id, auth.uid())
    )
  );

create policy "expense_messages_insert_member" on public.expense_messages
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id, auth.uid())
    )
  );

-- SETTLEMENTS: members of the group.
create policy "settlements_select_member" on public.settlements
  for select using (public.is_group_member(group_id, auth.uid()));

create policy "settlements_insert_member" on public.settlements
  for insert with check (public.is_group_member(group_id, auth.uid()));


-- ============================================================
-- RPC: create_expense_with_splits
-- Atomically creates an expense + its splits in one transaction.
-- p_splits is a JSON array: [{ "user_id": "...", "amount": 12.5,
--   "percentage": null, "shares": null }, ...]
-- ============================================================
create or replace function public.create_expense_with_splits(
  p_group_id uuid,
  p_description text,
  p_amount numeric,
  p_currency text,
  p_paid_by uuid,
  p_split_type text,
  p_splits jsonb
)
returns uuid as $$
declare
  v_expense_id uuid;
  v_split jsonb;
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'Not a member of this group';
  end if;

  insert into public.expenses (group_id, description, amount, currency, paid_by, created_by, split_type)
  values (p_group_id, p_description, p_amount, p_currency, p_paid_by, auth.uid(), p_split_type)
  returning id into v_expense_id;

  for v_split in select * from jsonb_array_elements(p_splits)
  loop
    insert into public.expense_splits (expense_id, user_id, amount, percentage, shares)
    values (
      v_expense_id,
      (v_split->>'user_id')::uuid,
      (v_split->>'amount')::numeric,
      (v_split->>'percentage')::numeric,
      (v_split->>'shares')::numeric
    );
  end loop;

  return v_expense_id;
end;
$$ language plpgsql security invoker;


-- ============================================================
-- RPC: get_group_balances
-- Returns net balance per group member:
--   positive = group owes this user money (they overpaid)
--   negative = this user owes the group money
-- Formula: (total paid in expenses) - (total owed via splits)
--          + (settlements received) - (settlements paid)
-- ============================================================
create or replace function public.get_group_balances(p_group_id uuid)
returns table (user_id uuid, display_name text, net_balance numeric) as $$
  select
    gm.user_id,
    p.display_name,
    coalesce(paid.total, 0) - coalesce(owed.total, 0)
      + coalesce(received.total, 0) - coalesce(paid_settle.total, 0) as net_balance
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  left join (
    select e.paid_by as user_id, sum(e.amount) as total
    from public.expenses e
    where e.group_id = p_group_id
    group by e.paid_by
  ) paid on paid.user_id = gm.user_id
  left join (
    select es.user_id, sum(es.amount) as total
    from public.expense_splits es
    join public.expenses e on e.id = es.expense_id
    where e.group_id = p_group_id
    group by es.user_id
  ) owed on owed.user_id = gm.user_id
  left join (
    select to_user as user_id, sum(amount) as total
    from public.settlements
    where group_id = p_group_id
    group by to_user
  ) received on received.user_id = gm.user_id
  left join (
    select from_user as user_id, sum(amount) as total
    from public.settlements
    where group_id = p_group_id
    group by from_user
  ) paid_settle on paid_settle.user_id = gm.user_id
  where gm.group_id = p_group_id;
$$ language sql security invoker stable;


-- ============================================================
-- RPC: get_group_pairwise_balances
-- Returns "who owes whom" within a group, netted between each
-- pair (debtor, creditor, amount > 0). No multi-hop debt
-- simplification — direct pairwise netting only.
-- ============================================================
create or replace function public.get_group_pairwise_balances(p_group_id uuid)
returns table (debtor uuid, debtor_name text, creditor uuid, creditor_name text, amount numeric) as $$
  with raw_debts as (
    -- For each expense split, the split-owner owes the payer their split amount
    -- (unless they ARE the payer)
    select
      es.user_id as debtor,
      e.paid_by as creditor,
      es.amount as amt
    from public.expense_splits es
    join public.expenses e on e.id = es.expense_id
    where e.group_id = p_group_id and es.user_id <> e.paid_by

    union all

    -- Settlements reduce debt: from_user paid to_user, so it's a
    -- negative debt from from_user -> to_user (i.e. credit in reverse)
    select
      to_user as debtor,
      from_user as creditor,
      amount as amt
    from public.settlements
    where group_id = p_group_id
  ),
  pair_totals as (
    select debtor, creditor, sum(amt) as total
    from raw_debts
    group by debtor, creditor
  ),
  -- Collapse each unordered pair {A,B} into a single signed net amount.
  -- net > 0 means a_id owes b_id; net < 0 means b_id owes a_id.
  netted as (
    select
      least(debtor, creditor) as a_id,
      greatest(debtor, creditor) as b_id,
      sum(case when debtor < creditor then total else -total end) as net
    from pair_totals
    group by least(debtor, creditor), greatest(debtor, creditor)
  )
  select
    case when n.net > 0 then n.a_id else n.b_id end as debtor,
    case when n.net > 0 then pa.display_name else pb.display_name end as debtor_name,
    case when n.net > 0 then n.b_id else n.a_id end as creditor,
    case when n.net > 0 then pb.display_name else pa.display_name end as creditor_name,
    abs(n.net) as amount
  from netted n
  join public.profiles pa on pa.id = n.a_id
  join public.profiles pb on pb.id = n.b_id
  where n.net <> 0
$$ language sql security invoker stable;

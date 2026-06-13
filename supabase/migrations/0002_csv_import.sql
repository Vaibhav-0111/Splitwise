-- ============================================================
-- Migration 0002: CSV bulk-import support
-- Adds expense_date to expenses, and an import_reports table
-- that stores the anomaly report produced each time a group
-- admin bulk-imports expenses from a CSV file.
-- ============================================================

-- ------------------------------------------------------------
-- expenses.expense_date — the date the expense actually occurred
-- (distinct from created_at, which is when the row was inserted).
-- Defaults to today for expenses created via the normal UI.
-- ------------------------------------------------------------
alter table public.expenses
  add column expense_date date not null default current_date;

create index idx_expenses_date on public.expenses(group_id, expense_date);


-- ------------------------------------------------------------
-- Extend create_expense_with_splits to optionally accept a
-- historical expense_date (used by CSV import). Existing callers
-- that don't pass it get current_date, preserving prior behavior.
-- ------------------------------------------------------------
create or replace function public.create_expense_with_splits(
  p_group_id uuid,
  p_description text,
  p_amount numeric,
  p_currency text,
  p_paid_by uuid,
  p_split_type text,
  p_splits jsonb,
  p_expense_date date default current_date
)
returns uuid as $$
declare
  v_expense_id uuid;
  v_split jsonb;
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'Not a member of this group';
  end if;

  insert into public.expenses (group_id, description, amount, currency, paid_by, created_by, split_type, expense_date)
  values (p_group_id, p_description, p_amount, p_currency, p_paid_by, auth.uid(), p_split_type, p_expense_date)
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


-- ------------------------------------------------------------
-- import_reports — one row per CSV import attempt. `report` is a
-- JSON blob containing the full per-row anomaly log (see
-- SCOPE.md for the anomaly taxonomy), shown to the user as the
-- "Import Report" required by the assignment.
-- ------------------------------------------------------------
create table public.import_reports (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  file_name text not null,
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  anomaly_count integer not null default 0,
  report jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_import_reports_group on public.import_reports(group_id);

alter table public.import_reports enable row level security;

create policy "import_reports_select_member" on public.import_reports
  for select using (public.is_group_member(group_id, auth.uid()));

create policy "import_reports_insert_member" on public.import_reports
  for insert with check (
    created_by = auth.uid()
    and public.is_group_member(group_id, auth.uid())
  );

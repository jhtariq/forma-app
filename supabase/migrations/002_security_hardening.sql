-- ============================================================
-- Migration 002: Security hardening
-- Adds upload quota tracking, role-based RLS hardening,
-- and Postgres-based rate limiting table.
-- ============================================================

-- ============================================================
-- 1. Upload quota tracking on organizations
-- ============================================================
alter table organizations
  add column if not exists upload_count integer not null default 0,
  add column if not exists upload_limit integer not null default 500;

-- ============================================================
-- 2. Helper: get current user's role (mirrors get_user_org_id pattern)
-- ============================================================
create or replace function get_user_role()
returns text as $$
  select role from app_users where id = auth.uid()
$$ language sql security definer stable;

-- ============================================================
-- 3. Atomic upload quota increment (service role only)
-- Returns TRUE if the increment succeeded, FALSE if quota exceeded.
-- Uses FOR UPDATE to prevent race conditions.
-- ============================================================
create or replace function increment_upload_count(org_id_input uuid)
returns boolean as $$
declare
  current_count integer;
  current_limit integer;
begin
  select upload_count, upload_limit
  into current_count, current_limit
  from organizations
  where id = org_id_input
  for update;

  if not found then
    return false;
  end if;

  if current_count >= current_limit then
    return false;
  end if;

  update organizations
  set upload_count = upload_count + 1
  where id = org_id_input;

  return true;
end;
$$ language plpgsql security definer;

revoke execute on function increment_upload_count(uuid) from public;
grant execute on function increment_upload_count(uuid) to service_role;

-- ============================================================
-- 4. Atomic upload quota decrement (used for rollback on failure)
-- ============================================================
create or replace function decrement_upload_count(org_id_input uuid)
returns void as $$
begin
  update organizations
  set upload_count = greatest(0, upload_count - 1)
  where id = org_id_input;
end;
$$ language plpgsql security definer;

revoke execute on function decrement_upload_count(uuid) from public;
grant execute on function decrement_upload_count(uuid) to service_role;

-- ============================================================
-- 5. Harden spec_revisions INSERT policy to require admin/member role
-- Only affects direct anon-key queries; service role bypasses RLS.
-- ============================================================
drop policy if exists "Users can insert spec revisions" on spec_revisions;

create policy "Members and admins can insert spec revisions"
  on spec_revisions for insert
  with check (
    get_user_role() in ('admin', 'member')
    and exists (
      select 1 from specs
      join projects on projects.id = specs.project_id
      where specs.id = spec_revisions.spec_id
      and projects.org_id = get_user_org_id()
    )
  );

-- ============================================================
-- 6. Harden bom_revisions INSERT policy to require admin/member role
-- ============================================================
drop policy if exists "Users can insert bom revisions" on bom_revisions;

create policy "Members and admins can insert bom revisions"
  on bom_revisions for insert
  with check (
    get_user_role() in ('admin', 'member')
    and exists (
      select 1 from boms
      join projects on projects.id = boms.project_id
      where boms.id = bom_revisions.bom_id
      and projects.org_id = get_user_org_id()
    )
  );

-- ============================================================
-- 7. Harden bom_rows INSERT policy to require admin/member role
-- ============================================================
drop policy if exists "Users can insert bom rows" on bom_rows;

create policy "Members and admins can insert bom rows"
  on bom_rows for insert
  with check (
    get_user_role() in ('admin', 'member')
    and exists (
      select 1 from bom_revisions
      join boms on boms.id = bom_revisions.bom_id
      join projects on projects.id = boms.project_id
      where bom_revisions.id = bom_rows.bom_revision_id
      and projects.org_id = get_user_org_id()
    )
  );

-- ============================================================
-- 8. Rate limit log table (Postgres-based sliding window)
-- Rows older than 1 hour are irrelevant and can be purged.
-- Enable pg_cron on Supabase to schedule cleanup if needed:
--   select cron.schedule('cleanup-rate-limit-log', '0 * * * *',
--     $$delete from rate_limit_log where created_at < now() - interval '1 hour'$$);
-- ============================================================
create table if not exists rate_limit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_log_lookup
  on rate_limit_log (user_id, action, created_at);

-- RLS: this table is service-role only (API routes use service role)
alter table rate_limit_log enable row level security;

-- No policies for anon/authenticated — only service role can insert/read
-- service_role bypasses RLS, so no explicit grant needed

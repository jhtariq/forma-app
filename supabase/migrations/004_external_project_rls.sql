-- ============================================================
-- Migration 004: External user project access control
-- Restricts External role to only see projects they are
-- explicitly assigned to via project_members.
-- ============================================================

-- ============================================================
-- 1. SECURITY DEFINER helper to check project membership
--    Runs as DB owner, bypassing RLS on project_members.
--    This breaks the circular dependency that would occur if
--    the projects policy directly queried project_members
--    (which itself has a policy that queries projects).
-- ============================================================
create or replace function is_project_member(p_project_id uuid)
returns boolean as $$
  select exists (
    select 1 from project_members
    where project_id = p_project_id
    and user_id = auth.uid()
  )
$$ language sql security definer stable;

-- ============================================================
-- 2. Replace the projects SELECT policy.
--    Non-external roles (admin, member, viewer) see all org
--    projects as before. External role only sees projects
--    where they have a project_members row.
-- ============================================================
drop policy if exists "Users can read projects in own org" on projects;

create policy "Users can read projects in own org"
  on projects for select
  using (
    org_id = get_user_org_id()
    and (
      get_user_role() != 'external'
      or is_project_member(id)
    )
  );

-- FORMA MVP P0 - Initial Database Schema
-- Run this in the Supabase SQL Editor

-- ============================================================
-- 1. Core workspace tables
-- ============================================================

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists facilities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null check (role in ('admin', 'member', 'external', 'viewer')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2. Projects
-- ============================================================

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  facility_id uuid not null references facilities(id) on delete cascade,
  name text not null,
  customer text not null default '',
  due_date date,
  status text not null default 'Draft' check (status in ('Draft', 'In Review', 'Approved', 'Exported')),
  created_by uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

-- ============================================================
-- 3. Documents
-- ============================================================

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  storage_bucket text not null default 'project-documents',
  storage_path text not null,
  tags text[] not null default '{}',
  notes text,
  uploaded_by uuid not null references app_users(id),
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_documents_project_id on documents(project_id);
create index if not exists idx_documents_tags on documents using gin(tags);

-- ============================================================
-- 4. Spec and revisions
-- ============================================================

create table if not exists specs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists spec_revisions (
  id uuid primary key default gen_random_uuid(),
  spec_id uuid not null references specs(id) on delete cascade,
  version_int int not null,
  fields_json jsonb not null default '{}',
  notes text,
  created_by uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  unique (spec_id, version_int)
);

-- ============================================================
-- 5. BOM and revisions
-- ============================================================

create table if not exists boms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists bom_revisions (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references boms(id) on delete cascade,
  version_int int not null,
  notes text,
  created_by uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  unique (bom_id, version_int)
);

create table if not exists bom_rows (
  id uuid primary key default gen_random_uuid(),
  bom_revision_id uuid not null references bom_revisions(id) on delete cascade,
  line_no int not null,
  material text not null default '',
  supplier text not null default '',
  qty numeric not null default 0,
  unit text not null default 'pcs',
  unit_cost numeric not null default 0,
  currency text,
  lead_time_days int,
  notes text,
  unique (bom_revision_id, line_no)
);

-- ============================================================
-- 6. Approvals
-- ============================================================

create table if not exists approval_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  entity_type text not null check (entity_type in ('spec', 'bom')),
  spec_revision_id uuid references spec_revisions(id),
  bom_revision_id uuid references bom_revisions(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid not null references app_users(id),
  requested_at timestamptz not null default now(),
  -- Ensure exactly one revision reference is set
  check (
    (entity_type = 'spec' and spec_revision_id is not null and bom_revision_id is null) or
    (entity_type = 'bom' and bom_revision_id is not null and spec_revision_id is null)
  )
);

create table if not exists approval_assignees (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references approval_requests(id) on delete cascade,
  user_id uuid not null references app_users(id),
  unique (approval_request_id, user_id)
);

create table if not exists approval_decisions (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references approval_requests(id) on delete cascade,
  user_id uuid not null references app_users(id),
  decision text not null check (decision in ('approve', 'reject')),
  comment text,
  decided_at timestamptz not null default now()
);

-- ============================================================
-- 7. Export history
-- ============================================================

create table if not exists export_packs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  spec_revision_id uuid references spec_revisions(id),
  bom_revision_id uuid references bom_revisions(id),
  included_document_ids uuid[] not null default '{}',
  storage_bucket text not null default 'project-exports',
  storage_path text not null,
  generated_by uuid not null references app_users(id),
  generated_at timestamptz not null default now()
);

-- ============================================================
-- 8. Audit trail
-- ============================================================

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  actor_user_id uuid not null references app_users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  diff_summary text,
  metadata_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_events_project_id on audit_events(project_id);
create index if not exists idx_audit_events_created_at on audit_events(created_at);

-- ============================================================
-- 9. Row Level Security (RLS)
-- Simplified for P0: org-level isolation + immutability rules
-- Role-based permission checks are in application code
-- ============================================================

alter table organizations enable row level security;
alter table facilities enable row level security;
alter table app_users enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table documents enable row level security;
alter table specs enable row level security;
alter table spec_revisions enable row level security;
alter table boms enable row level security;
alter table bom_revisions enable row level security;
alter table bom_rows enable row level security;
alter table approval_requests enable row level security;
alter table approval_assignees enable row level security;
alter table approval_decisions enable row level security;
alter table export_packs enable row level security;
alter table audit_events enable row level security;

-- Helper function: get the current user's org_id
create or replace function get_user_org_id()
returns uuid as $$
  select org_id from app_users where id = auth.uid()
$$ language sql security definer stable;

-- ---- Organizations ----
create policy "Users can read own org"
  on organizations for select
  using (id = get_user_org_id());

-- ---- Facilities ----
create policy "Users can read facilities in own org"
  on facilities for select
  using (org_id = get_user_org_id());

-- ---- App Users ----
create policy "Users can read users in own org"
  on app_users for select
  using (org_id = get_user_org_id());

-- ---- Projects ----
create policy "Users can read projects in own org"
  on projects for select
  using (org_id = get_user_org_id());

create policy "Users can insert projects in own org"
  on projects for insert
  with check (org_id = get_user_org_id());

create policy "Users can update projects in own org"
  on projects for update
  using (org_id = get_user_org_id());

-- ---- Project Members ----
create policy "Users can read project members in own org"
  on project_members for select
  using (
    exists (
      select 1 from projects
      where projects.id = project_members.project_id
      and projects.org_id = get_user_org_id()
    )
  );

create policy "Users can insert project members"
  on project_members for insert
  with check (
    exists (
      select 1 from projects
      where projects.id = project_members.project_id
      and projects.org_id = get_user_org_id()
    )
  );

-- ---- Documents ----
create policy "Users can read documents in own org projects"
  on documents for select
  using (
    exists (
      select 1 from projects
      where projects.id = documents.project_id
      and projects.org_id = get_user_org_id()
    )
  );

create policy "Users can insert documents"
  on documents for insert
  with check (
    exists (
      select 1 from projects
      where projects.id = documents.project_id
      and projects.org_id = get_user_org_id()
    )
  );

create policy "Users can update document tags and notes"
  on documents for update
  using (
    exists (
      select 1 from projects
      where projects.id = documents.project_id
      and projects.org_id = get_user_org_id()
    )
  );

-- ---- Specs ----
create policy "Users can read specs in own org"
  on specs for select
  using (
    exists (
      select 1 from projects
      where projects.id = specs.project_id
      and projects.org_id = get_user_org_id()
    )
  );

create policy "Users can insert specs"
  on specs for insert
  with check (
    exists (
      select 1 from projects
      where projects.id = specs.project_id
      and projects.org_id = get_user_org_id()
    )
  );

-- ---- Spec Revisions (insert-only, immutable) ----
create policy "Users can read spec revisions in own org"
  on spec_revisions for select
  using (
    exists (
      select 1 from specs
      join projects on projects.id = specs.project_id
      where specs.id = spec_revisions.spec_id
      and projects.org_id = get_user_org_id()
    )
  );

create policy "Users can insert spec revisions"
  on spec_revisions for insert
  with check (
    exists (
      select 1 from specs
      join projects on projects.id = specs.project_id
      where specs.id = spec_revisions.spec_id
      and projects.org_id = get_user_org_id()
    )
  );
-- No update or delete policies for spec_revisions (immutable)

-- ---- BOMs ----
create policy "Users can read boms in own org"
  on boms for select
  using (
    exists (
      select 1 from projects
      where projects.id = boms.project_id
      and projects.org_id = get_user_org_id()
    )
  );

create policy "Users can insert boms"
  on boms for insert
  with check (
    exists (
      select 1 from projects
      where projects.id = boms.project_id
      and projects.org_id = get_user_org_id()
    )
  );

-- ---- BOM Revisions (insert-only, immutable) ----
create policy "Users can read bom revisions in own org"
  on bom_revisions for select
  using (
    exists (
      select 1 from boms
      join projects on projects.id = boms.project_id
      where boms.id = bom_revisions.bom_id
      and projects.org_id = get_user_org_id()
    )
  );

create policy "Users can insert bom revisions"
  on bom_revisions for insert
  with check (
    exists (
      select 1 from boms
      join projects on projects.id = boms.project_id
      where boms.id = bom_revisions.bom_id
      and projects.org_id = get_user_org_id()
    )
  );
-- No update or delete policies for bom_revisions (immutable)

-- ---- BOM Rows (insert-only, immutable) ----
create policy "Users can read bom rows in own org"
  on bom_rows for select
  using (
    exists (
      select 1 from bom_revisions
      join boms on boms.id = bom_revisions.bom_id
      join projects on projects.id = boms.project_id
      where bom_revisions.id = bom_rows.bom_revision_id
      and projects.org_id = get_user_org_id()
    )
  );

create policy "Users can insert bom rows"
  on bom_rows for insert
  with check (
    exists (
      select 1 from bom_revisions
      join boms on boms.id = bom_revisions.bom_id
      join projects on projects.id = boms.project_id
      where bom_revisions.id = bom_rows.bom_revision_id
      and projects.org_id = get_user_org_id()
    )
  );
-- No update or delete policies for bom_rows (immutable)

-- ---- Approval Requests ----
create policy "Users can read approval requests in own org"
  on approval_requests for select
  using (
    exists (
      select 1 from projects
      where projects.id = approval_requests.project_id
      and projects.org_id = get_user_org_id()
    )
  );

create policy "Users can insert approval requests"
  on approval_requests for insert
  with check (
    exists (
      select 1 from projects
      where projects.id = approval_requests.project_id
      and projects.org_id = get_user_org_id()
    )
  );

create policy "Users can update approval request status"
  on approval_requests for update
  using (
    exists (
      select 1 from projects
      where projects.id = approval_requests.project_id
      and projects.org_id = get_user_org_id()
    )
  );

-- ---- Approval Assignees ----
create policy "Users can read approval assignees in own org"
  on approval_assignees for select
  using (
    exists (
      select 1 from approval_requests
      join projects on projects.id = approval_requests.project_id
      where approval_requests.id = approval_assignees.approval_request_id
      and projects.org_id = get_user_org_id()
    )
  );

create policy "Users can insert approval assignees"
  on approval_assignees for insert
  with check (
    exists (
      select 1 from approval_requests
      join projects on projects.id = approval_requests.project_id
      where approval_requests.id = approval_assignees.approval_request_id
      and projects.org_id = get_user_org_id()
    )
  );

-- ---- Approval Decisions ----
create policy "Users can read approval decisions in own org"
  on approval_decisions for select
  using (
    exists (
      select 1 from approval_requests
      join projects on projects.id = approval_requests.project_id
      where approval_requests.id = approval_decisions.approval_request_id
      and projects.org_id = get_user_org_id()
    )
  );

create policy "Users can insert approval decisions"
  on approval_decisions for insert
  with check (
    exists (
      select 1 from approval_requests
      join projects on projects.id = approval_requests.project_id
      where approval_requests.id = approval_decisions.approval_request_id
      and projects.org_id = get_user_org_id()
    )
  );

-- ---- Export Packs ----
create policy "Users can read export packs in own org"
  on export_packs for select
  using (
    exists (
      select 1 from projects
      where projects.id = export_packs.project_id
      and projects.org_id = get_user_org_id()
    )
  );

create policy "Users can insert export packs"
  on export_packs for insert
  with check (
    exists (
      select 1 from projects
      where projects.id = export_packs.project_id
      and projects.org_id = get_user_org_id()
    )
  );

-- ---- Audit Events (insert-only, immutable) ----
create policy "Users can read audit events in own org"
  on audit_events for select
  using (
    exists (
      select 1 from projects
      where projects.id = audit_events.project_id
      and projects.org_id = get_user_org_id()
    )
  );

create policy "Users can insert audit events"
  on audit_events for insert
  with check (
    exists (
      select 1 from projects
      where projects.id = audit_events.project_id
      and projects.org_id = get_user_org_id()
    )
  );
-- No update or delete policies for audit_events (immutable)

-- ============================================================
-- 10. Storage buckets
-- ============================================================
-- Run these via Supabase dashboard or storage API:
-- insert into storage.buckets (id, name, public) values ('project-documents', 'project-documents', false);
-- insert into storage.buckets (id, name, public) values ('project-exports', 'project-exports', false);

-- Storage policies (authenticated users in same org can read/write)
-- These need to be created via Supabase dashboard Storage > Policies

-- ============================================================
-- 11. Helper function: update project updated_at on changes
-- ============================================================

create or replace function update_project_updated_at()
returns trigger as $$
begin
  update projects set updated_at = now() where id = NEW.project_id;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_documents_update_project
  after insert on documents
  for each row execute function update_project_updated_at();

create trigger trg_spec_revisions_update_project
  after insert on spec_revisions
  for each row execute function update_project_updated_at();

-- For spec_revisions, project_id comes through specs table
create or replace function update_project_from_spec_revision()
returns trigger as $$
begin
  update projects set updated_at = now()
  where id = (select project_id from specs where id = NEW.spec_id);
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_spec_revisions_update_project on spec_revisions;
create trigger trg_spec_revisions_update_project
  after insert on spec_revisions
  for each row execute function update_project_from_spec_revision();

create or replace function update_project_from_bom_revision()
returns trigger as $$
begin
  update projects set updated_at = now()
  where id = (select project_id from boms where id = NEW.bom_id);
  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_bom_revisions_update_project
  after insert on bom_revisions
  for each row execute function update_project_from_bom_revision();

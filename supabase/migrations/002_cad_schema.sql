-- FORMA - Text-to-CAD Schema Extension
-- Adds SKU tracking and CAD version tables

-- ============================================================
-- 1. SKU table
-- ============================================================

create table if not exists skus (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  garment_type text not null default 'tshirt' check (garment_type in ('tshirt')),
  status text not null default 'draft' check (status in ('draft', 'revision', 'approved', 'production_ready')),
  created_by uuid not null references app_users(id),
  latest_cad_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 2. CAD versions table (immutable, insert-only)
-- ============================================================

create table if not exists cad_versions (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references skus(id) on delete cascade,
  version_int int not null,
  parameter_snapshot jsonb not null,
  svg_content text not null,
  dxf_storage_path text not null,
  svg_storage_path text not null,
  diff_summary text,
  notes text,
  created_by uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  unique (sku_id, version_int)
);

-- Add FK from skus to cad_versions (deferred since cad_versions didn't exist yet)
alter table skus
  add constraint fk_skus_latest_cad_version
  foreign key (latest_cad_version_id) references cad_versions(id);

-- ============================================================
-- 3. Modify approval_requests to support CAD entity type
-- ============================================================

-- Add cad_version_id column
alter table approval_requests
  add column if not exists cad_version_id uuid references cad_versions(id);

-- Drop existing constraints and recreate with CAD support
alter table approval_requests
  drop constraint if exists approval_requests_entity_type_check;

alter table approval_requests
  add constraint approval_requests_entity_type_check
  check (entity_type in ('spec', 'bom', 'cad'));

-- Drop the existing revision check constraint
-- (the unnamed check constraint from the CREATE TABLE)
-- We need to find and drop it by querying pg_constraint
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'approval_requests'::regclass
    and contype = 'c'
    and conname != 'approval_requests_entity_type_check'
    and conname != 'approval_requests_status_check'
  limit 1;

  if constraint_name is not null then
    execute format('alter table approval_requests drop constraint %I', constraint_name);
  end if;
end $$;

-- Add updated check constraint including CAD
alter table approval_requests
  add constraint approval_requests_revision_check check (
    (entity_type = 'spec' and spec_revision_id is not null and bom_revision_id is null and cad_version_id is null) or
    (entity_type = 'bom' and bom_revision_id is not null and spec_revision_id is null and cad_version_id is null) or
    (entity_type = 'cad' and cad_version_id is not null and spec_revision_id is null and bom_revision_id is null)
  );

-- ============================================================
-- 4. Indexes
-- ============================================================

create index if not exists idx_skus_project_id on skus(project_id);
create index if not exists idx_skus_org_id on skus(org_id);
create index if not exists idx_cad_versions_sku_id on cad_versions(sku_id);

-- ============================================================
-- 5. Row Level Security
-- ============================================================

alter table skus enable row level security;
alter table cad_versions enable row level security;

-- SKUs: org-level isolation
create policy "Users can read skus in own org"
  on skus for select
  using (org_id = get_user_org_id());

create policy "Users can insert skus in own org"
  on skus for insert
  with check (org_id = get_user_org_id());

create policy "Users can update skus in own org"
  on skus for update
  using (org_id = get_user_org_id());

-- CAD versions: insert-only (immutable), org isolation through skus join
create policy "Users can read cad versions in own org"
  on cad_versions for select
  using (
    exists (
      select 1 from skus
      where skus.id = cad_versions.sku_id
      and skus.org_id = get_user_org_id()
    )
  );

create policy "Users can insert cad versions"
  on cad_versions for insert
  with check (
    exists (
      select 1 from skus
      where skus.id = cad_versions.sku_id
      and skus.org_id = get_user_org_id()
    )
  );
-- No update or delete policies for cad_versions (immutable)

-- ============================================================
-- 6. Trigger: update project updated_at on CAD version insert
-- ============================================================

create or replace function update_project_from_cad_version()
returns trigger as $$
begin
  update projects set updated_at = now()
  where id = (select project_id from skus where id = NEW.sku_id);
  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_cad_versions_update_project
  after insert on cad_versions
  for each row execute function update_project_from_cad_version();

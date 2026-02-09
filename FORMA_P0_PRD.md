# FORMA MVP P0 Product Requirements Document
#
Version: 0.2
Date: February 08, 2026
Scope: P0 only, minimal implementation, demo ready
Target stack: Next.js 14+ App Router on Vercel, Supabase (Auth, Postgres, Storage), shadcn/ui + Tailwind, React Query, jsPDF

## 1. Overview

FORMA is a lightweight web app that helps a team keep a single source of truth for a manufacturing project by turning documents into two structured artifacts, a Spec and a BOM, then tracking revisions, approvals, audit history, and finally exporting an audit or compliance pack.

This PRD is written to be implementable without guessing. It includes screens, flows, tables, permissions, and API surface.

## 2. Problem statement

Teams building physical goods collect a mix of PDFs, images, spreadsheets, and notes from multiple people. The project becomes risky when there is no reliable answer to these questions.

1. What is the latest Spec that was actually approved
2. What is the latest BOM that was actually approved
3. Who changed what, when, and why
4. What exact set of files and approvals should be sent as an audit or compliance pack

The MVP solves this by enforcing revisioned records, approval tied to a specific revision, append only audit events, and export built from the latest approved artifacts.

## 3. Key definitions

### Manufacturing terms

BOM  
Bill of Materials, a table listing components and materials required to manufacture the product, including quantities and supplier information.

Spec  
Specification, a structured set of fields describing the product requirements, materials, packaging, labeling, QC, compliance, and notes.

### Workflow terms

Project  
A single manufacturing job or order that contains documents, Spec, BOM, approvals, export history, and audit events.

Revision  
An immutable snapshot of the Spec or BOM at a point in time. Editing creates a new revision, old revisions remain readable.

Approval request  
A request to approve one specific revision. If content changes, it becomes a new revision and requires a new approval request.

Audit trail  
An append only record of events that matter for traceability, such as uploads, revision creation, approval requests, approve or reject decisions, and exports.

Export pack  
A downloadable PDF or ZIP that includes the latest approved Spec and BOM, selected documents, and approval history summary.

## 4. Goals and non goals

### Goals

1. Provide a working end to end workflow for one organization and one facility
2. Support four roles, Admin, Member, External, Viewer
3. Support P0 feature set exactly, no missing P0 capability
4. Keep implementation minimal, predictable, and easy to modify

### Non goals, out of scope for P0

1. Multi facility complexity beyond a single facility
2. Advanced supplier graphs across projects
3. External system integrations, SSO, ERP, PLM, MES
4. Billing, subscriptions, granular permission builders
5. Advanced compliance frameworks beyond the export pack bundle

## 5. Users and roles

### Roles

Admin  
Full access across the workspace.

Member  
Full access except where an approval requires being assigned as an approver.

External  
Typically a vendor or factory user. Can upload documents only for projects they are assigned to. May approve only if assigned as an approver.

Viewer  
Read only access. Can export pack if allowed.

### Permission matrix

1. Create Project, Admin yes, Member yes, External no, Viewer no  
2. Upload Documents, Admin yes, Member yes, External yes if assigned, Viewer no  
3. Edit Spec and BOM, creates revisions, Admin yes, Member yes, External no unless explicitly allowed, Viewer no  
4. Request Approval, Admin yes, Member yes, External no, Viewer no  
5. Approve or Reject, Admin yes, Member yes if assigned approver, External yes if assigned approver, Viewer no  
6. Export Pack, Admin yes, Member yes, External no unless explicitly allowed, Viewer yes

## 6. P0 scope requirements

### P0 1 Authentication and workspace

1. Email and password login using Supabase Auth
2. Organization workspace exists, single Facility is acceptable
3. Roles supported, Admin, Member, External, Viewer

### P0 2 Projects and Orders

1. Create, list, view, update Project
2. Project fields  
   1. name  
   2. customer or brand  
   3. facility  
   4. due_date  
   5. status  
3. Project list screen and Project detail screen
4. Statuses supported
   1. Draft
   2. In Review
   3. Approved
   4. Exported
5. Status transition rules, semi-automatic
   1. Project starts as Draft
   2. Auto-transitions to In Review when the first approval request is created
   3. Auto-transitions to Approved when both Spec and BOM have at least one approved revision
   4. Auto-transitions to Exported after the first export pack is generated
   5. User with Admin or Member role can manually override status via a dropdown at any time

### P0 3 Document ingestion

1. Upload PDF, PNG, JPG, CSV, XLSX into a Project
2. Store file in object storage, store metadata in database  
   1. filename  
   2. type or mime_type  
   3. uploader  
   4. timestamp  
   5. tags, multi select  
   6. notes  
3. Preview behavior  
   1. PDF viewer in app, or open in new tab  
   2. Image viewer in app  
   3. Spreadsheet preview optional, download link required  
4. Document tags, multi select  
   1. Spec  
   2. BOM  
   3. QC  
   4. Compliance  
   5. Shipping  
   6. Other

### P0 4 Structured record, Spec

1. Spec belongs to a Project
2. Spec has a fixed default set of fields stored in SpecRevision.fields_json  
3. Custom fields supported as extra key value pairs inside fields_json, optional but recommended
4. Editing Spec creates a new SpecRevision

Default Spec fields
1. product_name
2. style_or_sku
3. season_or_collection
4. factory_name
5. country_of_origin
6. fabric_composition
7. colorways
8. sizes
9. measurements
10. construction_notes
11. packaging_requirements
12. labeling_requirements
13. qc_requirements
14. compliance_requirements
15. target_cost
16. lead_time_target
17. notes

### P0 5 Structured record, BOM

1. BOM belongs to a Project
2. BOM is a revisioned table
3. Editing BOM creates a new BOMRevision
4. BOM rows belong to a specific BOMRevision
5. CSV import into BOM rows supported, CSV import creates a new revision
6. CSV import details
   1. Fixed column order matching BOM row fields, line_no, material, supplier, qty, unit, unit_cost, currency, lead_time_days, notes
   2. Provide a downloadable CSV template with headers pre-filled
   3. No column mapping UI, columns must match expected order

Default BOM row fields
1. line_no, integer
2. material, string
3. supplier, string
4. qty, number
5. unit, string
6. unit_cost, number
7. currency, optional
8. lead_time_days, optional
9. notes, optional

### P0 6 Versioning and approvals

Rules that must hold
1. No silent overwrites  
   Editing Spec or BOM must create a new revision record, old revisions remain readable forever, revisions are immutable after creation.
2. Approval binds to a revision  
   ApprovalRequest references exactly one revision, if content changes, create a new revision and a new approval request.
3. Latest approved versus draft  
   Project must clearly show latest draft revision and latest approved revision for both Spec and BOM.
4. Export uses latest approved by default  
   Export pack uses the latest approved Spec and BOM unless user explicitly chooses otherwise.

Approval behaviors
1. Request approval on a specific SpecRevision or BOMRevision
2. Each approval request has exactly one assigned approver, single approver per request for P0
3. Approver can Approve or Reject
4. Reject requires a comment
5. Approve comment optional
6. Project shows latest approved Spec revision and latest approved BOM revision
7. Multi-approver support deferred to P1, the approval_assignees table still exists but will have exactly one row per request in P0

### P0 7 Audit trail

1. Append only events for  
   1. document uploads  
   2. new Spec revisions  
   3. new BOM revisions  
   4. approval requests  
   5. approve decisions  
   6. reject decisions  
   7. exports  
2. AuditEvent stores  
   1. who  
   2. when  
   3. entity type and id  
   4. action  
   5. optional diff summary  
   6. metadata json

### P0 8 Export pack

1. Generate a downloadable PDF or ZIP  
2. Acceptable implementation  
   ZIP that contains a generated PDF summary plus attached documents
3. Must include  
   1. cover page, project info  
   2. latest approved Spec  
   3. latest approved BOM  
   4. selected tagged docs  
   5. approval history summary  
4. Store export history in app with timestamp, generated_by, download link
5. Log an AuditEvent for export generation

## 7. Screens and UX requirements

### Global

1. Login screen
2. Top navigation, Projects
3. User menu, profile and logout

### Projects list

1. Table list columns  
   1. project name  
   2. customer  
   3. status  
   4. due date  
   5. last updated
2. Create Project button
3. Optional search and filter

### Project detail

Header shows project name, customer, facility, status, due date

Tabs
1. Documents
2. Spec
3. BOM
4. Approvals
5. Export
6. Audit Trail

### Documents tab

1. Upload control, drag and drop plus file picker
2. Document list shows
   1. filename
   2. tags
   3. uploaded_by
   4. uploaded_at
3. Preview behavior
   1. PDF, embedded viewer using react-pdf, rendered in-app without opening a new tab
   2. Images PNG and JPG, inline img preview
   3. Spreadsheets CSV and XLSX, download link only, no in-app preview
4. Edit tags and notes

### Spec tab

1. Show latest approved revision summary at top if exists
2. Show latest draft revision summary at top if exists and different from approved
3. Editable form for Spec fields, Save creates a new SpecRevision
4. Form layout uses grouped collapsible sections
   1. Product Info, product_name, style_or_sku, season_or_collection, factory_name, country_of_origin
   2. Materials and Construction, fabric_composition, colorways, sizes, measurements, construction_notes
   3. Requirements, packaging_requirements, labeling_requirements, qc_requirements, compliance_requirements
   4. Costs and Timing, target_cost, lead_time_target, notes
   5. Custom Fields, dynamic key value pair list with Add and Remove buttons
5. Revision history list with version labels, click to view read only snapshot
6. Request approval button for selected revision

### BOM tab

1. Same latest approved and latest draft summary pattern
2. Editable table for BOM rows, add and remove rows
3. CSV import button, import creates a new revision
4. Revision history list and view
5. Request approval button

### Approvals tab

1. List of approval requests  
   1. entity, Spec or BOM  
   2. revision version  
   3. status  
   4. requested_by  
   5. requested_at  
2. Detail view shows revision snapshot and relevant document links
3. Approve and Reject buttons for assigned approvers
4. Reject requires comment

### Export tab

1. Selector  
   1. Use latest approved, default  
   2. Or choose a specific revision for Spec and BOM
2. Checkbox list of documents by tag to include
3. Generate export button
4. Export history list with download links

### Audit Trail tab

1. Visual vertical timeline, not a table
2. Each event shows an icon by action type, actor name, timestamp, and description
3. Action type icons, upload, revision, approval request, approve, reject, export
4. Optional filters by action and entity

## 8. System architecture, minimal and robust

### Hosting

1. Next.js app hosted on Vercel
2. Supabase provides
   1. Auth
   2. Postgres database
   3. Storage buckets for documents and exports

### Frontend stack

1. Next.js 14+ with App Router
2. shadcn/ui component library plus Tailwind CSS
3. @tanstack/react-query for server state caching and invalidation
4. react-pdf for embedded PDF preview in Documents tab
5. Desktop-only layout, optimized for 1280px+ viewports

### Data access pattern

1. Frontend uses Supabase JS client with the anon key for reads and most writes, protected by RLS
2. Next.js API routes (Route Handlers) used only for export generation and any multi-step server-side operations
3. Supabase service role key used only in server-side routes, never exposed to the browser

### Export generation stack

1. jsPDF plus jspdf-autotable for server-side PDF creation
2. JSZip to produce the export ZIP containing Summary.pdf plus attached documents

### Storage buckets

1. project_documents
2. project_exports

File path convention, recommended
1. project_documents, org_id slash project_id slash document_id slash original_filename
2. project_exports, org_id slash project_id slash export_id slash export_filename

## 9. Data model, tables and fields

Implementation note  
Use UUID primary keys everywhere. Use created_at timestamps.

### Core workspace

organizations
1. id uuid primary key
2. name text
3. created_at timestamptz default now()

facilities
1. id uuid primary key
2. org_id uuid references organizations.id
3. name text
4. address text nullable
5. created_at timestamptz default now()

app_users
1. id uuid primary key, references auth.users.id
2. org_id uuid references organizations.id
3. email text
4. name text
5. role text, one of admin, member, external, viewer
6. created_at timestamptz default now()

### Projects

projects
1. id uuid primary key
2. org_id uuid references organizations.id
3. facility_id uuid references facilities.id
4. name text
5. customer text
6. due_date date nullable
7. status text, one of Draft, In Review, Approved, Exported
8. created_by uuid references app_users.id
9. created_at timestamptz default now()
10. updated_at timestamptz default now()

project_members  
Purpose  
Restrict External role to assigned projects.

Fields
1. id uuid primary key
2. project_id uuid references projects.id
3. user_id uuid references app_users.id
4. created_at timestamptz default now()

Constraints
1. unique project_id plus user_id

### Documents

documents
1. id uuid primary key
2. project_id uuid references projects.id
3. filename text
4. mime_type text
5. storage_bucket text, default project_documents
6. storage_path text
7. tags text array
8. notes text nullable
9. uploaded_by uuid references app_users.id
10. uploaded_at timestamptz default now()

Index recommendations
1. documents by project_id
2. documents by tags, using a GIN index on tags

### Spec and revisions

specs
1. id uuid primary key
2. project_id uuid references projects.id
3. created_at timestamptz default now()

spec_revisions
1. id uuid primary key
2. spec_id uuid references specs.id
3. version_int int
4. fields_json jsonb
5. notes text nullable
6. created_by uuid references app_users.id
7. created_at timestamptz default now()

Constraints
1. unique spec_id plus version_int
2. disallow updates and deletes through RLS, insert only

### BOM and revisions

boms
1. id uuid primary key
2. project_id uuid references projects.id
3. created_at timestamptz default now()

bom_revisions
1. id uuid primary key
2. bom_id uuid references boms.id
3. version_int int
4. notes text nullable
5. created_by uuid references app_users.id
6. created_at timestamptz default now()

bom_rows
1. id uuid primary key
2. bom_revision_id uuid references bom_revisions.id
3. line_no int
4. material text
5. supplier text
6. qty numeric
7. unit text
8. unit_cost numeric
9. currency text nullable
10. lead_time_days int nullable
11. notes text nullable

Constraints
1. unique bom_revision_id plus line_no
2. disallow updates and deletes through RLS, insert only for bom_rows and bom_revisions

### Approvals

approval_requests
1. id uuid primary key
2. project_id uuid references projects.id
3. entity_type text, one of spec, bom
4. spec_revision_id uuid nullable references spec_revisions.id
5. bom_revision_id uuid nullable references bom_revisions.id
6. status text, one of pending, approved, rejected, cancelled
7. requested_by uuid references app_users.id
8. requested_at timestamptz default now()

Constraint, exactly one revision reference
1. if entity_type is spec then spec_revision_id not null and bom_revision_id is null
2. if entity_type is bom then bom_revision_id not null and spec_revision_id is null

approval_assignees
1. id uuid primary key
2. approval_request_id uuid references approval_requests.id
3. user_id uuid references app_users.id

Constraint
1. unique approval_request_id plus user_id

approval_decisions
1. id uuid primary key
2. approval_request_id uuid references approval_requests.id
3. user_id uuid references app_users.id
4. decision text, one of approve, reject
5. comment text nullable, required when decision is reject
6. decided_at timestamptz default now()

Rule enforcement
1. When a decision is inserted, update approval_requests.status accordingly
2. Only allow decisions from assigned approvers

### Export history

export_packs
1. id uuid primary key
2. project_id uuid references projects.id
3. spec_revision_id uuid nullable references spec_revisions.id
4. bom_revision_id uuid nullable references bom_revisions.id
5. included_document_ids uuid array
6. storage_bucket text, default project_exports
7. storage_path text
8. generated_by uuid references app_users.id
9. generated_at timestamptz default now()

### Audit trail

audit_events
1. id uuid primary key
2. project_id uuid references projects.id
3. actor_user_id uuid references app_users.id
4. action text
5. entity_type text
6. entity_id uuid
7. diff_summary text nullable
8. metadata_json jsonb
9. created_at timestamptz default now()

Audit action values, recommended
1. document_uploaded
2. spec_revision_created
3. bom_revision_created
4. approval_requested
5. approval_approved
6. approval_rejected
7. export_generated

Constraints
1. disallow updates and deletes through RLS, insert only

## 10. Permissions and security, Row Level Security rules

### Implementation approach, simplified for P0

1. RLS enabled on all tables for org-level data isolation, users can only read and write rows matching their org_id
2. Role-based permission checks such as can this user edit, approve, or export are enforced in application code, not in RLS policies
3. This keeps RLS policies simple and debuggable while still enforcing security boundaries
4. Full RLS-based RBAC deferred to production hardening phase

### Workspace access

A user can read only rows within their org_id.

### Project access

Admin and Member can access all projects in the org.
External can access only assigned projects via project_members.
Viewer can access all projects read only.

### Write rules, enforced in application code

1. Viewer cannot edit Spec or BOM, cannot request approvals
2. External can upload documents only to assigned projects
3. Only Admin or Member can create Spec and BOM revisions
4. Only Admin or Member can request approvals
5. Only assigned approvers can approve or reject
6. Export allowed for Admin and Member, and Viewer if permitted, export uses latest approved by default

### Immutability rules, enforced via RLS insert-only policies

1. spec_revisions, bom_revisions, bom_rows, audit_events are insert only for all roles
2. documents updates allowed only for tags and notes, not for storage_path

## 11. API surface

This section defines the minimal API contract. The implementation may be direct Supabase calls from the client plus one server route for export generation.

### Auth

1. Login, Supabase Auth email password
2. Logout, Supabase Auth
3. Password reset optional

### Suggested REST endpoints for Next.js API routes

Projects
1. GET /projects
2. POST /projects
3. GET /projects/{id}

Documents
1. POST /projects/{id}/documents
2. GET /projects/{id}/documents

Spec
1. GET /projects/{id}/spec
2. POST /spec/{specId}/revisions

BOM
1. GET /projects/{id}/bom
2. POST /bom/{bomId}/revisions
3. POST /bom/{bomId}/import_csv

Approvals
1. POST /approvals
2. POST /approvals/{id}/decision

Exports
1. POST /projects/{id}/exports
2. GET /projects/{id}/exports

Audit
1. GET /projects/{id}/audit

### Minimal endpoint behavior details

POST /projects  
Creates a project, and also creates empty specs and boms records for the project so the tabs always work.

POST /spec/{specId}/revisions  
Creates a new spec_revisions row with version_int incremented. Also inserts audit_events with action spec_revision_created.

POST /bom/{bomId}/revisions  
Creates a new bom_revisions row, and inserts bom_rows for that revision. Also inserts audit_events with action bom_revision_created.

POST /approvals  
Creates approval_requests for a specific revision, creates approval_assignees, inserts audit_events with action approval_requested.

POST /approvals/{id}/decision  
Inserts approval_decisions, sets approval_requests.status, enforces reject comment. Inserts audit_events with action approval_approved or approval_rejected.

POST /projects/{id}/exports  
Default behavior is use latest approved spec and bom. Generates a ZIP or PDF. Writes file to Storage, creates export_packs record, inserts audit_events with action export_generated.

## 12. Export pack specification

Minimum viable format  
ZIP file that contains
1. Summary PDF named Summary.pdf
2. Attachment files copied from project documents, by user selected tags

Summary PDF sections
1. Cover page  
   Project name, customer, facility, due date, status, generated_at, generated_by
2. Latest approved Spec  
   Render each Spec field as label plus value
3. Latest approved BOM  
   Render BOM table
4. Included documents list  
   Each document filename plus tags
5. Approval history summary  
   For each approval request, entity type, revision version, requested_by, requested_at, decision, decided_by, decided_at, comment if reject

Export selection UI rules
1. Default uses latest approved Spec and BOM
2. If there is no approved Spec or no approved BOM, disable default export and show a message that approvals are required, allow manual selection if enabled for demo

## 13. Non functional requirements

Performance
For demo scale, pages should load within a few seconds.

Reliability
No silent data loss. Revisions and audit events must be durable.

Security
Use Supabase Auth. Enforce access using RLS. Do not place service role keys in the browser.

Responsiveness
Desktop only, optimized for 1280px+ viewport. No mobile or tablet layouts in P0.

Testing
No automated unit or integration tests for P0 demo. Validation is manual, against the 7 acceptance tests in Section 14. Focus all engineering effort on feature completeness.

## 14. Acceptance tests, Definition of Done

1. Document upload  
Given a user is in a Project, when they upload a PDF, it appears in Documents list with correct metadata and preview opens, and an audit event exists.

2. Spec revisions  
When a user edits Spec fields and saves, a new SpecRevision is created with incremented version. Old revisions remain viewable and unchanged. No edit modifies an existing revision.

3. BOM revisions  
When a user edits BOM rows and saves, a new BOMRevision is created and rows are attached to that revision. CSV import creates a new revision.

4. Approvals bind to revisions  
Requesting approval references exactly one revision id. Approving sets status approved and records a decision. Rejecting requires a comment and sets status rejected.

5. Latest approved displayed  
Project shows latest approved Spec and BOM revisions if approvals exist. Draft changes do not overwrite what is approved.

6. Export pack uses approved  
Generating export with latest approved selected includes approved Spec and BOM contents, not drafts. Export includes approvals summary. Audit event exists for export.

7. Role access control
Viewer cannot edit Spec or BOM, cannot request approvals. External can upload documents only for assigned project. Only assigned approvers can approve or reject.

## 15. Demo infrastructure

### Demo seed data

Pre-seeded on first deploy or via a seed script.

1. Organization, FORMA Demo Org
2. Facility, Main Factory
3. Users, all with password demo1234
   1. Admin, admin@forma-demo.com, role admin
   2. Member, member@forma-demo.com, role member
   3. External, vendor@forma-demo.com, role external
   4. Viewer, viewer@forma-demo.com, role viewer
4. Project, Pilot Order - Alpha
   1. 3 to 4 sample documents, a spec PDF, a BOM spreadsheet, a compliance doc
   2. Spec v1 approved plus Spec v2 draft with small changes
   3. BOM v1 approved
   4. Approval history for v1 approvals
   5. Several audit events covering uploads, revisions, approvals

### Dev-only user switcher

1. Dropdown in the top navigation bar, visible only in development or demo mode
2. Lists all seeded users with their display name and role
3. Clicking switches the active Supabase auth session instantly
4. Purpose is to demo the approval flow without logging out and logging in

### Deployment

1. Vercel deployment configured from day 1, git push triggers preview deploy
2. Environment variables required
   1. NEXT_PUBLIC_SUPABASE_URL
   2. NEXT_PUBLIC_SUPABASE_ANON_KEY
   3. SUPABASE_SERVICE_ROLE_KEY

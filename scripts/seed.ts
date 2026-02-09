/**
 * FORMA MVP P0 - Demo Seed Script
 *
 * Usage:
 *   npx tsx scripts/seed.ts
 *
 * Prerequisites:
 *   1. Supabase project created with migration applied
 *   2. Storage buckets "project-documents" and "project-exports" created
 *   3. .env.local file with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *
 * This script creates:
 *   - 4 auth users (admin, member, external, viewer)
 *   - 1 organization + 1 facility
 *   - 1 demo project "Pilot Order - Alpha"
 *   - Spec v1 (approved) + Spec v2 (draft)
 *   - BOM v1 (approved)
 *   - Approval history
 *   - Audit events
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DEMO_PASSWORD = 'demo1234'

const DEMO_USERS = [
  { email: 'admin@forma-demo.com', name: 'Alice Admin', role: 'admin' },
  { email: 'member@forma-demo.com', name: 'Mike Member', role: 'member' },
  { email: 'vendor@forma-demo.com', name: 'Vera Vendor', role: 'external' },
  { email: 'viewer@forma-demo.com', name: 'Victor Viewer', role: 'viewer' },
]

async function seed() {
  console.log('Starting FORMA demo seed...\n')

  // 1. Create auth users
  console.log('1. Creating auth users...')
  const userIds: Record<string, string> = {}

  for (const u of DEMO_USERS) {
    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers()
    const existing = existingUsers?.users?.find((eu) => eu.email === u.email)

    if (existing) {
      console.log(`   User ${u.email} already exists (${existing.id})`)
      userIds[u.role] = existing.id
      continue
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
    })

    if (error) {
      console.error(`   Failed to create ${u.email}:`, error.message)
      process.exit(1)
    }

    userIds[u.role] = data.user.id
    console.log(`   Created ${u.email} (${data.user.id})`)
  }

  // 2. Create organization
  console.log('\n2. Creating organization...')
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ name: 'FORMA Demo Org' })
    .select()
    .single()

  if (orgError) {
    // Maybe already exists
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select()
      .eq('name', 'FORMA Demo Org')
      .single()

    if (existingOrg) {
      console.log(`   Organization already exists (${existingOrg.id})`)
      await seedWithOrg(existingOrg.id, userIds)
      return
    }
    console.error('   Failed:', orgError.message)
    process.exit(1)
  }
  console.log(`   Created org: ${org.id}`)

  await seedWithOrg(org.id, userIds)
}

async function seedWithOrg(orgId: string, userIds: Record<string, string>) {
  // 3. Create facility
  console.log('\n3. Creating facility...')
  const { data: facility } = await supabase
    .from('facilities')
    .insert({ org_id: orgId, name: 'Main Factory', address: '123 Manufacturing Blvd' })
    .select()
    .single()

  if (!facility) {
    console.error('   Failed to create facility')
    process.exit(1)
  }
  console.log(`   Created facility: ${facility.id}`)

  // 4. Create app_users
  console.log('\n4. Creating app_users...')
  for (const u of DEMO_USERS) {
    const { error } = await supabase.from('app_users').upsert({
      id: userIds[u.role],
      org_id: orgId,
      email: u.email,
      name: u.name,
      role: u.role,
    })

    if (error) {
      console.error(`   Failed to create app_user ${u.email}:`, error.message)
    } else {
      console.log(`   Created app_user: ${u.name} (${u.role})`)
    }
  }

  const adminId = userIds['admin']
  const memberId = userIds['member']

  // 5. Create demo project
  console.log('\n5. Creating demo project...')
  const { data: project } = await supabase
    .from('projects')
    .insert({
      org_id: orgId,
      facility_id: facility.id,
      name: 'Pilot Order - Alpha',
      customer: 'Acme Apparel Co.',
      due_date: '2026-04-15',
      status: 'Approved',
      created_by: adminId,
    })
    .select()
    .single()

  if (!project) {
    console.error('   Failed to create project')
    process.exit(1)
  }
  console.log(`   Created project: ${project.id}`)

  // Add external user as project member
  await supabase.from('project_members').insert({
    project_id: project.id,
    user_id: userIds['external'],
  })

  // 6. Create spec
  console.log('\n6. Creating spec and revisions...')
  const { data: spec } = await supabase
    .from('specs')
    .insert({ project_id: project.id })
    .select()
    .single()

  if (!spec) {
    console.error('   Failed to create spec')
    process.exit(1)
  }

  // Spec v1 (will be approved)
  const specV1Fields = {
    product_name: 'Alpha Performance Jacket',
    style_or_sku: 'APJ-2026-001',
    season_or_collection: 'Spring 2026',
    factory_name: 'Main Factory',
    country_of_origin: 'Vietnam',
    fabric_composition: '92% Polyester, 8% Elastane',
    colorways: 'Navy Blue, Charcoal Grey, Forest Green',
    sizes: 'XS, S, M, L, XL, XXL',
    measurements: 'Standard US sizing, see measurement chart v3',
    construction_notes: 'Bonded seams, YKK zippers, reflective detailing on back panel',
    packaging_requirements: 'Individual polybag, hangtag, care label',
    labeling_requirements: 'Main label, care label, size label, country of origin',
    qc_requirements: 'AQL 2.5, inline inspection at 50% completion',
    compliance_requirements: 'OEKO-TEX Standard 100, REACH compliant',
    target_cost: '$24.50 FOB',
    lead_time_target: '45 days from PO',
    notes: 'Priority order for Q2 launch. Samples approved on Jan 20.',
  }

  const { data: specRev1 } = await supabase
    .from('spec_revisions')
    .insert({
      spec_id: spec.id,
      version_int: 1,
      fields_json: specV1Fields,
      notes: 'Initial spec submission',
      created_by: adminId,
    })
    .select()
    .single()

  console.log(`   Created Spec v1: ${specRev1?.id}`)

  // Spec v2 (draft, small change)
  const specV2Fields = {
    ...specV1Fields,
    target_cost: '$23.80 FOB',
    notes: 'Updated cost after supplier negotiation. Samples approved on Jan 20.',
  }

  const { data: specRev2 } = await supabase
    .from('spec_revisions')
    .insert({
      spec_id: spec.id,
      version_int: 2,
      fields_json: specV2Fields,
      notes: 'Updated target cost after supplier negotiation',
      created_by: memberId,
    })
    .select()
    .single()

  console.log(`   Created Spec v2: ${specRev2?.id}`)

  // 7. Create BOM
  console.log('\n7. Creating BOM and revisions...')
  const { data: bom } = await supabase
    .from('boms')
    .insert({ project_id: project.id })
    .select()
    .single()

  if (!bom) {
    console.error('   Failed to create BOM')
    process.exit(1)
  }

  const { data: bomRev1 } = await supabase
    .from('bom_revisions')
    .insert({
      bom_id: bom.id,
      version_int: 1,
      notes: 'Initial BOM',
      created_by: adminId,
    })
    .select()
    .single()

  // BOM rows
  const bomRowsData = [
    { line_no: 1, material: 'Performance Polyester Fabric', supplier: 'TextilePro Co.', qty: 1.8, unit: 'm', unit_cost: 5.20, currency: 'USD', lead_time_days: 21, notes: '4-way stretch' },
    { line_no: 2, material: 'Elastane Blend Lining', supplier: 'TextilePro Co.', qty: 1.2, unit: 'm', unit_cost: 3.80, currency: 'USD', lead_time_days: 21, notes: 'Moisture wicking' },
    { line_no: 3, material: 'YKK Zipper #5', supplier: 'YKK Corp', qty: 1, unit: 'pcs', unit_cost: 1.50, currency: 'USD', lead_time_days: 14, notes: 'Waterproof variant' },
    { line_no: 4, material: 'Reflective Tape 25mm', supplier: 'SafeGlow Ltd', qty: 0.6, unit: 'm', unit_cost: 2.10, currency: 'USD', lead_time_days: 7, notes: '3M Scotchlite' },
    { line_no: 5, material: 'Woven Labels', supplier: 'LabelMaster', qty: 3, unit: 'pcs', unit_cost: 0.15, currency: 'USD', lead_time_days: 10, notes: 'Main + care + size' },
    { line_no: 6, material: 'Hang Tags', supplier: 'LabelMaster', qty: 1, unit: 'pcs', unit_cost: 0.25, currency: 'USD', lead_time_days: 10, notes: 'Branded card stock' },
    { line_no: 7, material: 'Polybag', supplier: 'PackCo', qty: 1, unit: 'pcs', unit_cost: 0.08, currency: 'USD', lead_time_days: 5, notes: 'Biodegradable' },
  ]

  for (const row of bomRowsData) {
    await supabase.from('bom_rows').insert({
      bom_revision_id: bomRev1!.id,
      ...row,
    })
  }

  console.log(`   Created BOM v1 with ${bomRowsData.length} rows`)

  // 8. Create approval history
  console.log('\n8. Creating approval history...')

  // Spec v1 approval
  const { data: specApproval } = await supabase
    .from('approval_requests')
    .insert({
      project_id: project.id,
      entity_type: 'spec',
      spec_revision_id: specRev1!.id,
      status: 'approved',
      requested_by: adminId,
    })
    .select()
    .single()

  await supabase.from('approval_assignees').insert({
    approval_request_id: specApproval!.id,
    user_id: memberId,
  })

  await supabase.from('approval_decisions').insert({
    approval_request_id: specApproval!.id,
    user_id: memberId,
    decision: 'approve',
    comment: 'Spec looks good. All requirements are clearly defined.',
  })

  console.log('   Created Spec v1 approval (approved)')

  // BOM v1 approval
  const { data: bomApproval } = await supabase
    .from('approval_requests')
    .insert({
      project_id: project.id,
      entity_type: 'bom',
      bom_revision_id: bomRev1!.id,
      status: 'approved',
      requested_by: adminId,
    })
    .select()
    .single()

  await supabase.from('approval_assignees').insert({
    approval_request_id: bomApproval!.id,
    user_id: memberId,
  })

  await supabase.from('approval_decisions').insert({
    approval_request_id: bomApproval!.id,
    user_id: memberId,
    decision: 'approve',
    comment: 'BOM verified against supplier quotes. Costs are within budget.',
  })

  console.log('   Created BOM v1 approval (approved)')

  // 9. Create audit events
  console.log('\n9. Creating audit events...')

  const auditEvents = [
    { action: 'spec_revision_created', entity_type: 'spec_revision', entity_id: specRev1!.id, actor: adminId, metadata: { version: 1 } },
    { action: 'approval_requested', entity_type: 'approval_request', entity_id: specApproval!.id, actor: adminId, metadata: { entity_type: 'spec', version: 1 } },
    { action: 'approval_approved', entity_type: 'approval_request', entity_id: specApproval!.id, actor: memberId, metadata: { entity_type: 'spec', version: 1 } },
    { action: 'bom_revision_created', entity_type: 'bom_revision', entity_id: bomRev1!.id, actor: adminId, metadata: { version: 1, row_count: 7 } },
    { action: 'approval_requested', entity_type: 'approval_request', entity_id: bomApproval!.id, actor: adminId, metadata: { entity_type: 'bom', version: 1 } },
    { action: 'approval_approved', entity_type: 'approval_request', entity_id: bomApproval!.id, actor: memberId, metadata: { entity_type: 'bom', version: 1 } },
    { action: 'spec_revision_created', entity_type: 'spec_revision', entity_id: specRev2!.id, actor: memberId, metadata: { version: 2 } },
  ]

  for (const event of auditEvents) {
    await supabase.from('audit_events').insert({
      project_id: project.id,
      actor_user_id: event.actor,
      action: event.action,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      metadata_json: event.metadata,
    })
  }

  console.log(`   Created ${auditEvents.length} audit events`)

  console.log('\n✓ Seed complete!')
  console.log('\nDemo accounts (all use password "demo1234"):')
  DEMO_USERS.forEach((u) => {
    console.log(`  ${u.role.padEnd(10)} ${u.email}`)
  })
}

seed().catch(console.error)

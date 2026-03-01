import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

const MAX_BOM_ROWS = 500
const MAX_STRING_LENGTH = 500
const MAX_COST = 1_000_000
const MAX_QTY = 1_000_000
const MAX_LEAD_TIME_DAYS = 3650

interface BomRowInput {
  line_no: number
  material: string
  supplier: string
  qty: number
  unit: string
  unit_cost: number
  currency?: string | null
  lead_time_days?: number | null
  notes?: string | null
}

function validateBomRows(rows: unknown): { valid: boolean; error?: string } {
  if (!Array.isArray(rows)) {
    return { valid: false, error: 'rows must be an array' }
  }
  if (rows.length > MAX_BOM_ROWS) {
    return { valid: false, error: `Maximum ${MAX_BOM_ROWS} BOM rows allowed` }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (typeof row !== 'object' || row === null) {
      return { valid: false, error: `Row ${i + 1}: must be an object` }
    }
    const r = row as Record<string, unknown>

    if (typeof r.line_no !== 'number' || !Number.isInteger(r.line_no) || r.line_no < 1) {
      return { valid: false, error: `Row ${i + 1}: line_no must be a positive integer` }
    }
    if (typeof r.material !== 'string' || r.material.length > MAX_STRING_LENGTH) {
      return { valid: false, error: `Row ${i + 1}: material must be a string under ${MAX_STRING_LENGTH} chars` }
    }
    if (typeof r.supplier !== 'string' || r.supplier.length > MAX_STRING_LENGTH) {
      return { valid: false, error: `Row ${i + 1}: supplier must be a string under ${MAX_STRING_LENGTH} chars` }
    }
    if (typeof r.qty !== 'number' || r.qty < 0 || r.qty > MAX_QTY || !isFinite(r.qty)) {
      return { valid: false, error: `Row ${i + 1}: qty must be a number between 0 and ${MAX_QTY}` }
    }
    if (typeof r.unit !== 'string' || r.unit.length > 50) {
      return { valid: false, error: `Row ${i + 1}: unit must be a string under 50 chars` }
    }
    if (typeof r.unit_cost !== 'number' || r.unit_cost < 0 || r.unit_cost > MAX_COST || !isFinite(r.unit_cost)) {
      return { valid: false, error: `Row ${i + 1}: unit_cost must be a number between 0 and ${MAX_COST}` }
    }
    if (r.lead_time_days !== null && r.lead_time_days !== undefined) {
      if (
        typeof r.lead_time_days !== 'number' ||
        !Number.isInteger(r.lead_time_days) ||
        r.lead_time_days < 0 ||
        r.lead_time_days > MAX_LEAD_TIME_DAYS
      ) {
        return { valid: false, error: `Row ${i + 1}: lead_time_days must be null or an integer between 0 and ${MAX_LEAD_TIME_DAYS}` }
      }
    }
  }

  return { valid: true }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params

  // 1. Authenticate
  const supabase = await createServerSupabaseClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = await createServiceRoleClient()

  // 2. Fetch app user
  const { data: appUser } = await serviceClient
    .from('app_users')
    .select('id, org_id, role')
    .eq('id', authUser.id)
    .single()

  if (!appUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // 3. Role check — only admin and member can save BOM revisions
  if (!['admin', 'member'].includes(appUser.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  // 4. Rate limit
  const { limited } = await checkRateLimit(serviceClient, authUser.id, 'write')
  if (limited) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please wait before saving again.' }, { status: 429 })
  }

  // 5. Parse and validate body
  let body: { rows: unknown; notes?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { rows, notes } = body

  const validation = validateBomRows(rows)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  // 6. Verify project belongs to user's org
  const { data: project } = await serviceClient
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', appUser.org_id)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // 7. Get or verify BOM record exists
  const { data: bom } = await serviceClient
    .from('boms')
    .select('id')
    .eq('project_id', projectId)
    .single()

  if (!bom) {
    return NextResponse.json({ error: 'BOM not found for this project' }, { status: 404 })
  }

  // 8. Get current max version
  const { data: latestRevision } = await serviceClient
    .from('bom_revisions')
    .select('version_int')
    .eq('bom_id', bom.id)
    .order('version_int', { ascending: false })
    .limit(1)
    .single()

  const nextVersion = (latestRevision?.version_int ?? 0) + 1

  // 9. Create new revision (always insert, never update — immutable)
  const { data: revision, error: revError } = await serviceClient
    .from('bom_revisions')
    .insert({
      bom_id: bom.id,
      version_int: nextVersion,
      notes: notes?.trim().substring(0, 500) || `Version ${nextVersion}`,
      created_by: authUser.id,
    })
    .select()
    .single()

  if (revError) {
    console.error('BOM revision insert error:', revError)
    return NextResponse.json({ error: 'Failed to create BOM revision' }, { status: 500 })
  }

  // 10. Insert BOM rows (filter out blank material rows)
  const typedRows = rows as BomRowInput[]
  const rowsToInsert = typedRows
    .filter((r) => r.material.trim().length > 0)
    .map((r) => ({
      bom_revision_id: revision.id,
      line_no: r.line_no,
      material: r.material.trim().substring(0, MAX_STRING_LENGTH),
      supplier: r.supplier.trim().substring(0, MAX_STRING_LENGTH),
      qty: r.qty,
      unit: r.unit.trim().substring(0, 50),
      unit_cost: r.unit_cost,
      currency: r.currency?.trim().substring(0, 10) ?? null,
      lead_time_days: r.lead_time_days ?? null,
      notes: r.notes?.trim().substring(0, 1000) ?? null,
    }))

  if (rowsToInsert.length > 0) {
    const { error: rowsError } = await serviceClient
      .from('bom_rows')
      .insert(rowsToInsert)

    if (rowsError) {
      console.error('BOM rows insert error:', rowsError)
      return NextResponse.json({ error: 'Failed to insert BOM rows' }, { status: 500 })
    }
  }

  // 11. Log audit event
  await serviceClient.from('audit_events').insert({
    project_id: projectId,
    actor_user_id: authUser.id,
    action: 'bom_revision_created',
    entity_type: 'bom_revision',
    entity_id: revision.id,
    metadata_json: { version: nextVersion, row_count: rowsToInsert.length },
  })

  return NextResponse.json({
    revisionId: revision.id,
    version: nextVersion,
    rowCount: rowsToInsert.length,
  })
}

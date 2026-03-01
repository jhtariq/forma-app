import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { ALL_SPEC_FIELD_KEYS } from '@/lib/constants'

const MAX_FIELD_VALUE_LENGTH = 5000
const MAX_FIELD_KEY_LENGTH = 100
const MAX_CUSTOM_FIELDS = 50
// Regexp for valid field keys: alphanumeric, underscores, hyphens only
const FIELD_KEY_PATTERN = /^[a-zA-Z0-9_-]+$/

function validateAndSanitizeSpecFields(
  fields: unknown
): { valid: boolean; sanitized?: Record<string, string>; error?: string } {
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
    return { valid: false, error: 'fields_json must be a plain object' }
  }

  const raw = fields as Record<string, unknown>
  const sanitized: Record<string, string> = {}
  let customFieldCount = 0

  for (const [key, value] of Object.entries(raw)) {
    // Validate key length
    if (key.length > MAX_FIELD_KEY_LENGTH) {
      return { valid: false, error: `Field key '${key.substring(0, 30)}...' exceeds max length of ${MAX_FIELD_KEY_LENGTH}` }
    }
    // Validate key characters (prevents injection via key names)
    if (!FIELD_KEY_PATTERN.test(key)) {
      return { valid: false, error: `Field key '${key}' contains invalid characters. Only letters, numbers, underscores, and hyphens are allowed.` }
    }
    // Validate value is a string
    if (typeof value !== 'string') {
      return { valid: false, error: `Field '${key}' value must be a string` }
    }
    // Validate value length
    if (value.length > MAX_FIELD_VALUE_LENGTH) {
      return { valid: false, error: `Field '${key}' value exceeds max length of ${MAX_FIELD_VALUE_LENGTH} characters` }
    }
    // Count non-standard (custom) fields
    if (!(ALL_SPEC_FIELD_KEYS as readonly string[]).includes(key)) {
      customFieldCount++
      if (customFieldCount > MAX_CUSTOM_FIELDS) {
        return { valid: false, error: `Maximum ${MAX_CUSTOM_FIELDS} custom fields allowed` }
      }
    }

    sanitized[key] = value.trim()
  }

  return { valid: true, sanitized }
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

  // 3. Role check — only admin and member can save Spec revisions
  if (!['admin', 'member'].includes(appUser.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  // 4. Rate limit
  const { limited } = await checkRateLimit(serviceClient, authUser.id, 'write')
  if (limited) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please wait before saving again.' }, { status: 429 })
  }

  // 5. Parse and validate body
  let body: { fields_json: unknown; notes?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { fields_json, notes } = body

  const validation = validateAndSanitizeSpecFields(fields_json)
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

  // 7. Get Spec record
  const { data: spec } = await serviceClient
    .from('specs')
    .select('id')
    .eq('project_id', projectId)
    .single()

  if (!spec) {
    return NextResponse.json({ error: 'Spec not found for this project' }, { status: 404 })
  }

  // 8. Get current max version
  const { data: latestRevision } = await serviceClient
    .from('spec_revisions')
    .select('version_int')
    .eq('spec_id', spec.id)
    .order('version_int', { ascending: false })
    .limit(1)
    .single()

  const nextVersion = (latestRevision?.version_int ?? 0) + 1

  // 9. Create new revision (always insert, never update — immutable)
  const { data: revision, error: revError } = await serviceClient
    .from('spec_revisions')
    .insert({
      spec_id: spec.id,
      version_int: nextVersion,
      fields_json: validation.sanitized,
      notes: notes?.trim().substring(0, 500) || `Version ${nextVersion}`,
      created_by: authUser.id,
    })
    .select()
    .single()

  if (revError) {
    console.error('Spec revision insert error:', revError)
    return NextResponse.json({ error: 'Failed to create Spec revision' }, { status: 500 })
  }

  // 10. Log audit event
  await serviceClient.from('audit_events').insert({
    project_id: projectId,
    actor_user_id: authUser.id,
    action: 'spec_revision_created',
    entity_type: 'spec_revision',
    entity_id: revision.id,
    metadata_json: { version: nextVersion },
  })

  return NextResponse.json({ revisionId: revision.id, version: nextVersion })
}

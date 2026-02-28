import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

const ALLOWED_STATUSES = ['Draft', 'In Review', 'Archived']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    // 1. Parse body
    let body: { status: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { status } = body

    // 2. Validate status
    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    // 3. Authenticate
    const supabase = await createServerSupabaseClient()
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceClient = await createServiceRoleClient()

    // 4. Fetch app user
    const { data: appUser } = await serviceClient
      .from('app_users')
      .select('id, org_id, role')
      .eq('id', authUser.id)
      .single()

    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 5. Role check — only admin and member can change project status
    if (!['admin', 'member'].includes(appUser.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // 6. Rate limit
    const { limited } = await checkRateLimit(serviceClient, authUser.id, 'write')
    if (limited) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please wait before saving again.' }, { status: 429 })
    }

    // 7. Verify project belongs to user's org
    const { data: project } = await serviceClient
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('org_id', appUser.org_id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // 8. Update project status
    const { error: updateError } = await serviceClient
      .from('projects')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', projectId)

    if (updateError) {
      console.error('Project status update error:', updateError)
      return NextResponse.json({ error: 'Failed to update project status' }, { status: 500 })
    }

    // 9. Log audit event
    await serviceClient.from('audit_events').insert({
      project_id: projectId,
      actor_user_id: authUser.id,
      action: 'project_status_changed',
      entity_type: 'project',
      entity_id: projectId,
      metadata_json: { to: status },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in project status route:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Get projectId from params
    const { id: projectId } = await params

    // 2. Parse JSON body
    let body: { entityType: unknown; revisionId: unknown; approverId: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { entityType, revisionId, approverId } = body

    // 3. Validate inputs
    if (entityType !== 'spec' && entityType !== 'bom' && entityType !== 'cad') {
      return NextResponse.json(
        { error: "entityType must be 'spec', 'bom', or 'cad'" },
        { status: 400 }
      )
    }
    if (typeof revisionId !== 'string' || !revisionId.trim()) {
      return NextResponse.json({ error: 'revisionId must be a non-empty string' }, { status: 400 })
    }
    if (typeof approverId !== 'string' || !approverId.trim()) {
      return NextResponse.json({ error: 'approverId must be a non-empty string' }, { status: 400 })
    }

    const typedEntityType = entityType as 'spec' | 'bom' | 'cad'
    const typedRevisionId = revisionId.trim()
    const typedApproverId = approverId.trim()

    // 4. Create clients
    const supabase = await createServerSupabaseClient()
    const serviceClient = await createServiceRoleClient()

    // 5. Auth check
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 6. Fetch appUser
    const { data: appUser } = await serviceClient
      .from('app_users')
      .select('id, org_id, role')
      .eq('id', authUser.id)
      .single()

    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 7. Role check: only 'admin' or 'member'
    if (!['admin', 'member'].includes(appUser.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // 8. Rate limit
    const { limited } = await checkRateLimit(serviceClient, appUser.id, 'write')
    if (limited) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before saving again.' },
        { status: 429 }
      )
    }

    // 9. Verify project belongs to user's org
    const { data: project } = await serviceClient
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('org_id', appUser.org_id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // 10. Verify approverId is a valid user in same org (not viewer, not self)
    const { data: approver } = await serviceClient
      .from('app_users')
      .select('id, role')
      .eq('id', typedApproverId)
      .eq('org_id', appUser.org_id)
      .single()

    if (!approver) {
      return NextResponse.json({ error: 'Invalid approver' }, { status: 400 })
    }

    if (approver.role === 'viewer') {
      return NextResponse.json(
        { error: 'Viewers cannot be assigned as approvers' },
        { status: 400 }
      )
    }

    if (typedApproverId === authUser.id) {
      return NextResponse.json(
        { error: 'You cannot assign yourself as approver' },
        { status: 400 }
      )
    }

    // 11. Verify revisionId belongs to this project (anti-spoofing)
    if (typedEntityType === 'spec') {
      const { data: specRevision } = await serviceClient
        .from('spec_revisions')
        .select('id, specs!inner(project_id)')
        .eq('id', typedRevisionId)
        .single()

      if (!specRevision) {
        return NextResponse.json({ error: 'Invalid revision for this project' }, { status: 400 })
      }

      const specProjectId = (specRevision.specs as unknown as { project_id: string }).project_id
      if (specProjectId !== projectId) {
        return NextResponse.json({ error: 'Invalid revision for this project' }, { status: 400 })
      }
    } else if (typedEntityType === 'bom') {
      const { data: bomRevision } = await serviceClient
        .from('bom_revisions')
        .select('id, boms!inner(project_id)')
        .eq('id', typedRevisionId)
        .single()

      if (!bomRevision) {
        return NextResponse.json({ error: 'Invalid revision for this project' }, { status: 400 })
      }

      const bomProjectId = (bomRevision.boms as unknown as { project_id: string }).project_id
      if (bomProjectId !== projectId) {
        return NextResponse.json({ error: 'Invalid revision for this project' }, { status: 400 })
      }
    } else {
      // entityType === 'cad'
      const { data: cadVersion } = await serviceClient
        .from('cad_versions')
        .select('id, skus!inner(project_id)')
        .eq('id', typedRevisionId)
        .single()

      if (!cadVersion) {
        return NextResponse.json({ error: 'Invalid revision for this project' }, { status: 400 })
      }

      const cadProjectId = (cadVersion.skus as unknown as { project_id: string }).project_id
      if (cadProjectId !== projectId) {
        return NextResponse.json({ error: 'Invalid revision for this project' }, { status: 400 })
      }
    }

    // 12. INSERT approval_requests
    const { data: approvalRequest, error: requestError } = await serviceClient
      .from('approval_requests')
      .insert({
        project_id: projectId,
        entity_type: typedEntityType,
        spec_revision_id: typedEntityType === 'spec' ? typedRevisionId : null,
        bom_revision_id: typedEntityType === 'bom' ? typedRevisionId : null,
        cad_version_id: typedEntityType === 'cad' ? typedRevisionId : null,
        status: 'pending',
        requested_by: authUser.id,
      })
      .select()
      .single()

    if (requestError || !approvalRequest) {
      console.error('Approval request insert error:', requestError)
      return NextResponse.json({ error: 'Failed to create approval request' }, { status: 500 })
    }

    // 13. INSERT approval_assignees
    const { error: assigneeError } = await serviceClient
      .from('approval_assignees')
      .insert({
        approval_request_id: approvalRequest.id,
        user_id: typedApproverId,
      })

    if (assigneeError) {
      console.error('Approval assignee insert error:', assigneeError)
      return NextResponse.json({ error: 'Failed to assign approver' }, { status: 500 })
    }

    // 14. UPDATE projects status to 'In Review' if currently 'Draft'
    await serviceClient
      .from('projects')
      .update({ status: 'In Review', updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('status', 'Draft')

    // 15. Log audit event
    await serviceClient.from('audit_events').insert({
      project_id: projectId,
      actor_user_id: authUser.id,
      action: 'approval_requested',
      entity_type: 'approval_request',
      entity_id: approvalRequest.id,
      metadata_json: { entity_type: typedEntityType, revision_id: typedRevisionId },
    })

    // 16. Return success
    return NextResponse.json({ requestId: approvalRequest.id })
  } catch (err) {
    console.error('Unexpected error in approval request route:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

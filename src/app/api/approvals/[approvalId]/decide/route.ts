import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ approvalId: string }> }
) {
  try {
    // 1. Get approvalId from params
    const { approvalId } = await params

    // 2. Parse JSON body
    let body: { decision: unknown; comment?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { decision, comment } = body

    // 3. Validate: decision must be 'approve' or 'reject'
    if (decision !== 'approve' && decision !== 'reject') {
      return NextResponse.json(
        { error: "decision must be 'approve' or 'reject'" },
        { status: 400 }
      )
    }

    const typedDecision = decision as 'approve' | 'reject'
    const typedComment = typeof comment === 'string' ? comment : undefined

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

    // 6. Fetch appUser from app_users
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

    // 9. Fetch the approval_request with project join to verify org
    const { data: approval } = await serviceClient
      .from('approval_requests')
      .select('id, status, project_id, entity_type, projects!inner(org_id)')
      .eq('id', approvalId)
      .single()

    if (!approval) {
      return NextResponse.json({ error: 'Approval request not found' }, { status: 404 })
    }

    const projectOrgId = (approval.projects as unknown as { org_id: string }).org_id
    if (projectOrgId !== appUser.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 10. If approval.status !== 'pending', it has already been decided
    if (approval.status !== 'pending') {
      return NextResponse.json(
        { error: 'This request has already been decided' },
        { status: 400 }
      )
    }

    // 11. If rejecting, comment is required
    if (typedDecision === 'reject' && (!typedComment || !typedComment.trim())) {
      return NextResponse.json(
        { error: 'Comment is required when rejecting' },
        { status: 400 }
      )
    }

    // 12. Verify caller is an assigned approver
    const { data: assignee } = await serviceClient
      .from('approval_assignees')
      .select('user_id')
      .eq('approval_request_id', approvalId)
      .eq('user_id', authUser.id)
      .single()

    if (!assignee) {
      return NextResponse.json(
        { error: 'You are not assigned as an approver for this request' },
        { status: 403 }
      )
    }

    // 13. INSERT approval_decisions
    const { error: decisionError } = await serviceClient
      .from('approval_decisions')
      .insert({
        approval_request_id: approvalId,
        user_id: authUser.id,
        decision: typedDecision,
        comment: typedComment?.trim() || null,
      })

    if (decisionError) {
      console.error('Approval decision insert error:', decisionError)
      return NextResponse.json({ error: 'Failed to record decision' }, { status: 500 })
    }

    // 14. UPDATE approval_requests status
    const { error: updateError } = await serviceClient
      .from('approval_requests')
      .update({ status: typedDecision === 'approve' ? 'approved' : 'rejected' })
      .eq('id', approvalId)

    if (updateError) {
      console.error('Approval request update error:', updateError)
      return NextResponse.json({ error: 'Failed to update approval request' }, { status: 500 })
    }

    // 15. Log audit event
    await serviceClient.from('audit_events').insert({
      project_id: approval.project_id,
      actor_user_id: authUser.id,
      action: typedDecision === 'approve' ? 'approval_approved' : 'approval_rejected',
      entity_type: 'approval_request',
      entity_id: approvalId,
      metadata_json: { decision: typedDecision, comment: typedComment?.trim() || null },
    })

    // 16. If approved, check if both spec AND bom are now approved for this project
    if (typedDecision === 'approve') {
      const { data: approvedRequests } = await serviceClient
        .from('approval_requests')
        .select('entity_type')
        .eq('project_id', approval.project_id)
        .eq('status', 'approved')

      if (approvedRequests) {
        const approvedTypes = approvedRequests.map((r) => r.entity_type)
        if (approvedTypes.includes('spec') && approvedTypes.includes('bom')) {
          // Both spec and bom are approved — promote project to 'Approved'
          await serviceClient
            .from('projects')
            .update({ status: 'Approved', updated_at: new Date().toISOString() })
            .eq('id', approval.project_id)

          await serviceClient.from('audit_events').insert({
            project_id: approval.project_id,
            actor_user_id: authUser.id,
            action: 'project_status_changed',
            entity_type: 'project',
            entity_id: approval.project_id,
            metadata_json: { from: 'In Review', to: 'Approved' },
          })
        }
      }
    }

    // 17. Return success
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in approval decide route:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

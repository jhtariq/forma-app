import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

// DELETE /api/projects/[id]/members/[userId]
// Removes a user from the project. Admin only.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id: projectId, userId } = await params

    const supabase = await createServerSupabaseClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceClient = await createServiceRoleClient()

    // Fetch requesting user
    const { data: appUser } = await serviceClient
      .from('app_users')
      .select('org_id, role')
      .eq('id', authUser.id)
      .single()

    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Only admin can manage members
    if (appUser.role !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Verify project belongs to same org
    const { data: project } = await serviceClient
      .from('projects')
      .select('org_id')
      .eq('id', projectId)
      .single()

    if (!project || project.org_id !== appUser.org_id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Verify the membership exists
    const { data: membership } = await serviceClient
      .from('project_members')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Member not found on this project' }, { status: 404 })
    }

    // Delete the membership
    const { error: deleteError } = await serviceClient
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId)

    if (deleteError) {
      console.error('Error deleting project member:', deleteError)
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
    }

    // Log audit event
    await serviceClient.from('audit_events').insert({
      project_id: projectId,
      actor_user_id: authUser.id,
      action: 'member_removed',
      entity_type: 'project_member',
      entity_id: projectId,
      metadata_json: { removed_user_id: userId },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in DELETE /members/[userId]:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

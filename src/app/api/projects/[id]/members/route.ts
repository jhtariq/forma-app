import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

// GET /api/projects/[id]/members
// Returns all project members with user details.
// Accessible to any authenticated org member.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    const supabase = await createServerSupabaseClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceClient = await createServiceRoleClient()

    // Verify the requesting user belongs to the same org as the project
    const { data: appUser } = await serviceClient
      .from('app_users')
      .select('org_id')
      .eq('id', authUser.id)
      .single()

    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: project } = await serviceClient
      .from('projects')
      .select('org_id')
      .eq('id', projectId)
      .single()

    if (!project || project.org_id !== appUser.org_id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Fetch project members with user details
    const { data: members, error } = await serviceClient
      .from('project_members')
      .select('id, user_id, created_at, app_users(id, name, email, role)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching project members:', error)
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 })
    }

    return NextResponse.json({ members: members ?? [] })
  } catch (err) {
    console.error('Unexpected error in GET /members:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/projects/[id]/members
// Adds a user to the project. Admin only.
// Body: { userId: string }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    let body: { userId: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { userId } = body
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

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

    // Validate the target user: must be in same org and have external role
    const { data: targetUser } = await serviceClient
      .from('app_users')
      .select('id, org_id, role')
      .eq('id', userId)
      .single()

    if (!targetUser || targetUser.org_id !== appUser.org_id) {
      return NextResponse.json({ error: 'User not found in organization' }, { status: 404 })
    }

    if (targetUser.role !== 'external') {
      return NextResponse.json(
        { error: 'Only external users can be assigned as project members' },
        { status: 400 }
      )
    }

    // Check not already a member (unique constraint would also catch this, but give a clearer error)
    const { data: existing } = await serviceClient
      .from('project_members')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'User is already a member of this project' }, { status: 409 })
    }

    // Insert membership
    const { error: insertError } = await serviceClient
      .from('project_members')
      .insert({ project_id: projectId, user_id: userId })

    if (insertError) {
      console.error('Error inserting project member:', insertError)
      return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
    }

    // Log audit event
    await serviceClient.from('audit_events').insert({
      project_id: projectId,
      actor_user_id: authUser.id,
      action: 'member_added',
      entity_type: 'project_member',
      entity_id: projectId,
      metadata_json: { added_user_id: userId },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in POST /members:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

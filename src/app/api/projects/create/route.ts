import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    // 1. Parse body
    let body: { name: string; customer: string; facilityId?: string; dueDate?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { name, customer, facilityId, dueDate } = body

    // 2. Validate inputs
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 200) {
      return NextResponse.json(
        { error: 'name must be a non-empty string with a maximum of 200 characters' },
        { status: 400 }
      )
    }

    if (!customer || typeof customer !== 'string' || customer.trim().length === 0 || customer.length > 200) {
      return NextResponse.json(
        { error: 'customer must be a non-empty string with a maximum of 200 characters' },
        { status: 400 }
      )
    }

    if (facilityId !== undefined && typeof facilityId !== 'string') {
      return NextResponse.json({ error: 'facilityId must be a string' }, { status: 400 })
    }

    if (dueDate !== undefined) {
      const parsed = Date.parse(dueDate)
      if (isNaN(parsed)) {
        return NextResponse.json({ error: 'dueDate must be a valid ISO date string' }, { status: 400 })
      }
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

    // 5. Role check — only admin and member can create projects
    if (!['admin', 'member'].includes(appUser.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // 6. Rate limit
    const { limited } = await checkRateLimit(serviceClient, authUser.id, 'write')
    if (limited) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please wait before saving again.' }, { status: 429 })
    }

    // 7. Verify facilityId belongs to user's org (if provided)
    if (facilityId) {
      const { data: facility } = await serviceClient
        .from('facilities')
        .select('id')
        .eq('id', facilityId)
        .eq('org_id', appUser.org_id)
        .single()

      if (!facility) {
        return NextResponse.json({ error: 'Invalid facility' }, { status: 400 })
      }
    }

    // 8. Insert project
    const { data: project, error: projectError } = await serviceClient
      .from('projects')
      .insert({
        org_id: appUser.org_id,
        facility_id: facilityId || null,
        name: name.trim(),
        customer: customer.trim(),
        due_date: dueDate || null,
        status: 'Draft',
        created_by: authUser.id,
      })
      .select()
      .single()

    if (projectError || !project) {
      console.error('Project insert error:', projectError)
      return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
    }

    // 9. Insert specs record
    const { error: specsError } = await serviceClient
      .from('specs')
      .insert({ project_id: project.id })

    if (specsError) {
      console.error('Specs insert error:', specsError)
      return NextResponse.json({ error: 'Failed to create project spec' }, { status: 500 })
    }

    // 10. Insert boms record
    const { error: bomsError } = await serviceClient
      .from('boms')
      .insert({ project_id: project.id })

    if (bomsError) {
      console.error('Boms insert error:', bomsError)
      return NextResponse.json({ error: 'Failed to create project BOM' }, { status: 500 })
    }

    // 11. Log audit event
    await serviceClient.from('audit_events').insert({
      project_id: project.id,
      actor_user_id: authUser.id,
      action: 'project_created',
      entity_type: 'project',
      entity_id: project.id,
      metadata_json: { name: project.name },
    })

    return NextResponse.json({ projectId: project.id })
  } catch (err) {
    console.error('Unexpected error in project create route:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

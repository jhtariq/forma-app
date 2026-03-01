import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    // 1. Get projectId and docId from params
    const { id: projectId, docId } = await params

    // 2. Parse body
    let body: { tags?: unknown; notes?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { tags, notes } = body

    // 3. Validate inputs
    if (tags !== undefined) {
      if (
        !Array.isArray(tags) ||
        tags.length > 20 ||
        tags.some((t) => typeof t !== 'string' || t.length > 50)
      ) {
        return NextResponse.json(
          { error: 'tags must be an array of up to 20 strings, each max 50 characters' },
          { status: 400 }
        )
      }
    }

    if (notes !== undefined) {
      if (typeof notes !== 'string' || notes.length > 1000) {
        return NextResponse.json(
          { error: 'notes must be a string of max 1000 characters' },
          { status: 400 }
        )
      }
    }

    if (tags === undefined && notes === undefined) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

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

    // 6. Fetch app user
    const { data: appUser } = await serviceClient
      .from('app_users')
      .select('id, org_id, role')
      .eq('id', authUser.id)
      .single()

    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 7. Role check — only admin and member can update documents
    if (!['admin', 'member'].includes(appUser.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // 8. Rate limit
    const { limited } = await checkRateLimit(serviceClient, authUser.id, 'write')
    if (limited) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before trying again.' },
        { status: 429 }
      )
    }

    // 9. Verify document belongs to this project AND project belongs to user's org
    const { data: document, error: docError } = await serviceClient
      .from('documents')
      .select('id, projects!inner(id, org_id)')
      .eq('id', docId)
      .eq('project_id', projectId)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const docProject = Array.isArray(document.projects) ? document.projects[0] : document.projects
    if (docProject.org_id !== appUser.org_id) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // 10. Build update object (only include provided fields)
    const updateData: Record<string, unknown> = {}
    if (tags !== undefined) updateData.tags = (tags as string[]).map((t: string) => t.trim().substring(0, 50))
    if (notes !== undefined) updateData.notes = (notes as string).trim().substring(0, 1000)

    // 11. Update document
    const { error: updateError } = await serviceClient
      .from('documents')
      .update(updateData)
      .eq('id', docId)

    if (updateError) {
      console.error('Document update error:', updateError)
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
    }

    // 12. Log audit event
    await serviceClient.from('audit_events').insert({
      project_id: projectId,
      actor_user_id: authUser.id,
      action: 'document_updated',
      entity_type: 'document',
      entity_id: docId,
      metadata_json: { updated_fields: Object.keys(updateData) },
    })

    // 13. Return success
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error in document update:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

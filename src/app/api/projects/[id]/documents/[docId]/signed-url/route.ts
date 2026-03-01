import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    // 1. Get projectId and docId from params
    const { id: projectId, docId } = await params

    // 2. Create clients
    const supabase = await createServerSupabaseClient()
    const serviceClient = await createServiceRoleClient()

    // 3. Auth check
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 4. Fetch app user
    const { data: appUser } = await serviceClient
      .from('app_users')
      .select('id, org_id, role')
      .eq('id', authUser.id)
      .single()

    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 5. Rate limit (write bucket — 30/min is fine for URL generation)
    const { limited } = await checkRateLimit(serviceClient, authUser.id, 'write')
    if (limited) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before trying again.' },
        { status: 429 }
      )
    }

    // 6. Verify document belongs to this project AND project belongs to user's org
    const { data: document, error: docError } = await serviceClient
      .from('documents')
      .select('id, storage_bucket, storage_path, filename, projects!inner(id, org_id)')
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

    // 7. Generate 1-hour signed URL
    const { data: signedData, error: signedError } = await serviceClient.storage
      .from(document.storage_bucket)
      .createSignedUrl(document.storage_path, 3600)

    if (signedError || !signedData?.signedUrl) {
      console.error('Signed URL generation error:', signedError)
      return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 })
    }

    // 8. Log audit event
    await serviceClient.from('audit_events').insert({
      project_id: projectId,
      actor_user_id: authUser.id,
      action: 'document_viewed',
      entity_type: 'document',
      entity_id: docId,
      metadata_json: { filename: document.filename },
    })

    // 9. Return signed URL
    return NextResponse.json({ url: signedData.signedUrl })
  } catch (err) {
    console.error('Unexpected error in signed URL generation:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

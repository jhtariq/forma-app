import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  try {
    const { versionId } = await params

    if (!versionId) {
      return NextResponse.json({ error: 'Missing versionId' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()
    const serviceClient = await createServiceRoleClient()

    // Auth check
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get app user
    const { data: appUser } = await serviceClient
      .from('app_users')
      .select('*')
      .eq('id', authUser.id)
      .single()
    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch the cad_version (with sku to verify org ownership)
    const { data: cadVersion } = await serviceClient
      .from('cad_versions')
      .select('*, sku:skus(org_id, project_id, name)')
      .eq('id', versionId)
      .single()

    if (!cadVersion) {
      return NextResponse.json({ error: 'CAD version not found' }, { status: 404 })
    }

    // Verify org ownership
    const sku = cadVersion.sku as { org_id: string; project_id: string; name: string } | null
    if (!sku || sku.org_id !== appUser.org_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const packPath = cadVersion.manufacturing_pack_path as string | null
    if (!packPath) {
      return NextResponse.json(
        { error: 'Manufacturing pack not available for this version' },
        { status: 404 }
      )
    }

    // Generate signed URL (1 hour TTL)
    const { data: signedData, error: signedError } = await serviceClient.storage
      .from('project-documents')
      .createSignedUrl(packPath, 3600)

    if (signedError || !signedData?.signedUrl) {
      return NextResponse.json(
        { error: 'Failed to generate download URL', details: signedError?.message },
        { status: 500 }
      )
    }

    // Log audit event
    await serviceClient.from('audit_events').insert({
      project_id: sku.project_id,
      actor_user_id: appUser.id,
      action: 'manufacturing_pack_downloaded',
      entity_type: 'cad_version',
      entity_id: versionId,
      diff_summary: null,
      metadata_json: {
        sku_name: sku.name,
        version: cadVersion.version_int,
        pack_path: packPath,
      },
    })

    return NextResponse.json({ url: signedData.signedUrl })
  } catch (err) {
    console.error('Manufacturing pack download error:', err)
    return NextResponse.json(
      { error: 'Failed to generate manufacturing pack download URL' },
      { status: 500 }
    )
  }
}

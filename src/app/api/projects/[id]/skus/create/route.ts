import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

const ALLOWED_GARMENT_TYPES = ['tshirt']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    // 1. Parse body
    let body: { name: string; garmentType: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { name, garmentType } = body

    // 2. Validate inputs
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      return NextResponse.json(
        { error: 'name must be a non-empty string with a maximum of 100 characters' },
        { status: 400 }
      )
    }

    if (!ALLOWED_GARMENT_TYPES.includes(garmentType)) {
      return NextResponse.json({ error: 'Invalid garment type' }, { status: 400 })
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

    // 5. Role check — only admin and member can create SKUs
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

    // 8. Insert SKU
    const { data: sku, error: skuError } = await serviceClient
      .from('skus')
      .insert({
        project_id: projectId,
        org_id: appUser.org_id,
        name: name.trim(),
        garment_type: garmentType,
        status: 'draft',
        created_by: authUser.id,
      })
      .select()
      .single()

    if (skuError || !sku) {
      console.error('SKU insert error:', skuError)
      return NextResponse.json({ error: 'Failed to create SKU' }, { status: 500 })
    }

    // 9. Log audit event
    await serviceClient.from('audit_events').insert({
      project_id: projectId,
      actor_user_id: authUser.id,
      action: 'sku_created',
      entity_type: 'sku',
      entity_id: sku.id,
      metadata_json: { name: sku.name, garment_type: garmentType },
    })

    return NextResponse.json({ skuId: sku.id, name: sku.name })
  } catch (err) {
    console.error('Unexpected error in SKU create route:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import {
  generateTshirtPattern,
  renderSvg,
  renderDxf,
  renderTechSketch,
  generateSpecSheet,
  generateConstructionNotes,
  generateBom,
  assembleManufacturingPack,
  validateTshirtParams,
  computeParamDiff,
  buildVersionDiffJson,
} from '@/lib/cad'
import type { TshirtParams } from '@/lib/cad'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, skuId, params, notes } = body as {
      projectId: string
      skuId: string
      params: TshirtParams
      notes?: string
    }

    if (!projectId || !skuId || !params) {
      return NextResponse.json(
        { error: 'Missing required fields: projectId, skuId, params' },
        { status: 400 }
      )
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

    // Permission check
    if (appUser.role !== 'admin' && appUser.role !== 'member') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Validate SKU belongs to project and org
    const { data: sku } = await serviceClient
      .from('skus')
      .select('*')
      .eq('id', skuId)
      .eq('project_id', projectId)
      .eq('org_id', appUser.org_id)
      .single()
    if (!sku) {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 })
    }

    // Validate parameters
    const validation = validateTshirtParams(params)
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Validation failed', errors: validation.errors },
        { status: 400 }
      )
    }

    // Determine next version
    const { data: existingVersions } = await serviceClient
      .from('cad_versions')
      .select('version_int, parameter_snapshot')
      .eq('sku_id', skuId)
      .order('version_int', { ascending: false })
      .limit(1)

    const nextVersion =
      existingVersions && existingVersions.length > 0
        ? existingVersions[0].version_int + 1
        : 1

    // Generate pattern (PatternIR + PatternPiece[])
    const { ir, pieces } = generateTshirtPattern(params, nextVersion)

    // Render all artifacts
    const svgContent = renderSvg(ir)
    const dxfContent = renderDxf(ir)
    const techSketchSvg = renderTechSketch(ir)
    const specSheet = generateSpecSheet(ir)
    const constructionNotes = generateConstructionNotes(ir)
    const bom = generateBom(ir)

    // Compute diff if not first version
    let diffSummary: string | null = null
    let versionDiff: object | null = null
    if (existingVersions && existingVersions.length > 0) {
      const oldParams = existingVersions[0].parameter_snapshot as TshirtParams
      diffSummary = computeParamDiff(oldParams, params)
      versionDiff = buildVersionDiffJson(
        oldParams,
        params,
        existingVersions[0].version_int,
        nextVersion
      )
    }

    // Assemble Manufacturing Pack .zip
    const zipBuffer = await assembleManufacturingPack({
      dxf: dxfContent,
      svg: svgContent,
      techSketchSvg,
      specSheet,
      constructionNotes,
      bom,
      parameterSnapshot: { ...params, derived: ir.derived, template_type: 'tshirt', schema_version: 2 },
      versionDiff: versionDiff ?? undefined,
    })

    // Generate version ID
    const versionId = crypto.randomUUID()

    // Upload all files to storage
    const basePath = `${appUser.org_id}/${projectId}/cad/${skuId}/${versionId}`
    const dxfPath = `${basePath}/pattern.dxf`
    const svgPath = `${basePath}/pattern_preview.svg`
    const techSketchPath = `${basePath}/tech_sketch.svg`
    const packPath = `${basePath}/manufacturing_pack.zip`

    const [dxfUpload, svgUpload, techSketchUpload, packUpload] = await Promise.all([
      serviceClient.storage
        .from('project-documents')
        .upload(dxfPath, Buffer.from(dxfContent), { contentType: 'application/dxf' }),
      serviceClient.storage
        .from('project-documents')
        .upload(svgPath, Buffer.from(svgContent), { contentType: 'image/svg+xml' }),
      serviceClient.storage
        .from('project-documents')
        .upload(techSketchPath, Buffer.from(techSketchSvg), { contentType: 'image/svg+xml' }),
      serviceClient.storage
        .from('project-documents')
        .upload(packPath, zipBuffer, { contentType: 'application/zip' }),
    ])

    if (dxfUpload.error || svgUpload.error || techSketchUpload.error || packUpload.error) {
      const errMsg =
        dxfUpload.error?.message ||
        svgUpload.error?.message ||
        techSketchUpload.error?.message ||
        packUpload.error?.message
      return NextResponse.json(
        { error: 'Failed to upload CAD files', details: errMsg },
        { status: 500 }
      )
    }

    // Insert cad_version record
    const { data: cadVersion, error: insertError } = await serviceClient
      .from('cad_versions')
      .insert({
        id: versionId,
        sku_id: skuId,
        version_int: nextVersion,
        parameter_snapshot: params as unknown as Record<string, unknown>,
        svg_content: svgContent,
        dxf_storage_path: dxfPath,
        svg_storage_path: svgPath,
        tech_sketch_storage_path: techSketchPath,
        manufacturing_pack_path: packPath,
        pattern_ir: ir as unknown as Record<string, unknown>,
        diff_summary: diffSummary,
        notes: notes || null,
        created_by: appUser.id,
      })
      .select()
      .single()

    if (insertError || !cadVersion) {
      return NextResponse.json(
        { error: 'Failed to create CAD version', details: insertError?.message },
        { status: 500 }
      )
    }

    // Update SKU
    const newStatus = sku.status === 'draft' ? 'revision' : sku.status
    await serviceClient
      .from('skus')
      .update({
        latest_cad_version_id: versionId,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', skuId)

    // Log audit event
    await serviceClient.from('audit_events').insert({
      project_id: projectId,
      actor_user_id: appUser.id,
      action: 'cad_version_generated',
      entity_type: 'cad_version',
      entity_id: versionId,
      diff_summary: diffSummary,
      metadata_json: {
        sku_name: sku.name,
        version: nextVersion,
        garment_type: sku.garment_type,
        sleeve_cap_adjusted: ir.derived.sleeve_cap_adjusted,
        sleeve_cap_adjustment_mm: ir.derived.sleeve_cap_adjustment_mm,
      },
    })

    return NextResponse.json({
      cadVersionId: versionId,
      svgContent,
      techSketchSvg,
      version: nextVersion,
      diffSummary,
      sleeveCapAdjusted: ir.derived.sleeve_cap_adjusted,
      sleeveCapAdjustmentMm: ir.derived.sleeve_cap_adjustment_mm,
      manufacturingPackPath: packPath,
    })
  } catch (err) {
    console.error('CAD generation error:', err)
    return NextResponse.json({ error: 'Failed to generate CAD' }, { status: 500 })
  }
}

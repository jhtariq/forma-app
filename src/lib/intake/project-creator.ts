import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExtractedOrderData } from './gemini-extractor'

export interface CreatedProjectResult {
  projectId: string
  specRevisionId: string
  documentId: string | null
}

/**
 * Creates a new project with an initial spec revision and optional document
 * from agentic email intake extraction results.
 */
export async function createProjectFromExtraction(
  serviceClient: SupabaseClient,
  actorUserId: string,
  orgId: string,
  extracted: ExtractedOrderData,
  pdfBuffer: Buffer | null,
  pdfFilename: string | null
): Promise<CreatedProjectResult> {
  // 1. Derive a project name — fall back to product_name or a default
  const projectName =
    extracted.project_name ||
    extracted.product_name ||
    extracted.style_or_sku ||
    'Untitled Order'

  // 2. Derive customer name — fall back to "Unknown Vendor"
  const customerName = extracted.customer_name || 'Unknown Vendor'

  // 3. Get the org's first facility (facility_id is NOT NULL in DB)
  const { data: facility } = await serviceClient
    .from('facilities')
    .select('id')
    .eq('org_id', orgId)
    .limit(1)
    .single()

  if (!facility) {
    throw new Error('No facility found for this organisation. Please create a facility first.')
  }

  // 4. Create project
  const { data: project, error: projectError } = await serviceClient
    .from('projects')
    .insert({
      org_id: orgId,
      facility_id: facility.id,
      name: projectName.substring(0, 200),
      customer: customerName.substring(0, 200),
      due_date: extracted.due_date || null,
      status: 'Draft',
      created_by: actorUserId,
    })
    .select()
    .single()

  if (projectError || !project) {
    throw new Error(`Failed to create project: ${projectError?.message}`)
  }

  // 4. Create specs container
  const { error: specsError } = await serviceClient
    .from('specs')
    .insert({ project_id: project.id })

  if (specsError) {
    throw new Error(`Failed to create specs: ${specsError.message}`)
  }

  // 5. Create boms container
  const { error: bomsError } = await serviceClient
    .from('boms')
    .insert({ project_id: project.id })

  if (bomsError) {
    throw new Error(`Failed to create boms: ${bomsError.message}`)
  }

  // 6. Build spec fields_json from extracted data (omit nulls)
  const specFields: Record<string, string> = {}
  const specKeyMap: Record<string, keyof ExtractedOrderData> = {
    product_name: 'product_name',
    style_or_sku: 'style_or_sku',
    season_or_collection: 'season_or_collection',
    factory_name: 'factory_name',
    country_of_origin: 'country_of_origin',
    fabric_composition: 'fabric_composition',
    colorways: 'colorways',
    sizes: 'sizes',
    measurements: 'measurements',
    construction_notes: 'construction_notes',
    packaging_requirements: 'packaging_requirements',
    labeling_requirements: 'labeling_requirements',
    qc_requirements: 'qc_requirements',
    compliance_requirements: 'compliance_requirements',
    target_cost: 'target_cost',
    lead_time_target: 'lead_time_target',
    notes: 'notes',
  }

  for (const [specKey, extractedKey] of Object.entries(specKeyMap)) {
    const val = extracted[extractedKey]
    if (val && typeof val === 'string' && val.trim().length > 0) {
      specFields[specKey] = val.trim().substring(0, 5000)
    }
  }

  // 7. Get spec container id
  const { data: spec } = await serviceClient
    .from('specs')
    .select('id')
    .eq('project_id', project.id)
    .single()

  if (!spec) {
    throw new Error('Spec container not found after insert')
  }

  // 8. Create spec revision (version 1)
  const { data: revision, error: revError } = await serviceClient
    .from('spec_revisions')
    .insert({
      spec_id: spec.id,
      version_int: 1,
      fields_json: specFields,
      notes: 'Auto-extracted from vendor email',
      created_by: actorUserId,
    })
    .select()
    .single()

  if (revError || !revision) {
    throw new Error(`Failed to create spec revision: ${revError?.message}`)
  }

  // 9. Upload PDF to Supabase storage and create document record
  let documentId: string | null = null
  if (pdfBuffer && pdfFilename) {
    const storagePath = `${orgId}/${project.id}/intake/${pdfFilename}`

    const { error: uploadError } = await serviceClient.storage
      .from('project-documents')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (!uploadError) {
      const { data: docRecord } = await serviceClient
        .from('documents')
        .insert({
          project_id: project.id,
          filename: pdfFilename,
          mime_type: 'application/pdf',
          storage_bucket: 'project-documents',
          storage_path: storagePath,
          tags: ['Spec'],
          notes: 'Attached to intake email',
          uploaded_by: actorUserId,
        })
        .select()
        .single()

      documentId = docRecord?.id ?? null
    } else {
      console.error('PDF upload error (non-fatal):', uploadError)
    }
  }

  // 10. Log audit events
  await serviceClient.from('audit_events').insert({
    project_id: project.id,
    actor_user_id: actorUserId,
    action: 'project_created',
    entity_type: 'project',
    entity_id: project.id,
    metadata_json: { source: 'email_intake', name: project.name },
  })

  await serviceClient.from('audit_events').insert({
    project_id: project.id,
    actor_user_id: actorUserId,
    action: 'spec_revision_created',
    entity_type: 'spec_revision',
    entity_id: revision.id,
    metadata_json: { version: 1, source: 'email_intake', fields_count: Object.keys(specFields).length },
  })

  if (documentId) {
    await serviceClient.from('audit_events').insert({
      project_id: project.id,
      actor_user_id: actorUserId,
      action: 'document_uploaded',
      entity_type: 'document',
      entity_id: documentId,
      metadata_json: { filename: pdfFilename, source: 'email_intake' },
    })
  }

  return {
    projectId: project.id,
    specRevisionId: revision.id,
    documentId,
  }
}

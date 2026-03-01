import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

// Allowed MIME types (whitelist)
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
])

// Allowed file extensions (secondary check against MIME spoofing)
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.csv', '.xlsx', '.xls'])

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params

  // 1. Authenticate
  const supabase = await createServerSupabaseClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = await createServiceRoleClient()

  // 2. Fetch app user and verify role
  const { data: appUser } = await serviceClient
    .from('app_users')
    .select('id, org_id, role')
    .eq('id', authUser.id)
    .single()

  if (!appUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const uploadAllowedRoles = ['admin', 'member', 'external']
  if (!uploadAllowedRoles.includes(appUser.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  // 3. Verify project belongs to user's org
  const { data: project } = await serviceClient
    .from('projects')
    .select('id, org_id')
    .eq('id', projectId)
    .eq('org_id', appUser.org_id)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // 4. Rate limit
  const { limited } = await checkRateLimit(serviceClient, authUser.id, 'upload')
  if (limited) {
    return NextResponse.json(
      { error: 'Upload rate limit exceeded. Please wait before uploading more files.' },
      { status: 429 }
    )
  }

  // 5. Parse multipart form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // 6. Validate file size
  if (file.size === 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      {
        error: `File too large. Maximum size is 10 MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
      },
      { status: 413 }
    )
  }

  // 7. Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `File type '${file.type}' is not allowed. Allowed types: PDF, PNG, JPG, CSV, XLSX.` },
      { status: 415 }
    )
  }

  // 8. Validate file extension (defense in depth against MIME spoofing)
  const rawExtension = file.name.split('.').pop()?.toLowerCase()
  const extension = rawExtension ? `.${rawExtension}` : ''
  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      { error: `File extension '${extension}' is not allowed.` },
      { status: 415 }
    )
  }

  // 9. Sanitize filename
  const sanitizedFilename = file.name
    .replace(/\.\./g, '_')            // Block path traversal
    .replace(/[^\w.\-\s]/g, '_')      // Replace non-alphanumeric (keep dots, dashes, spaces)
    .trim()
    .substring(0, 200)

  // 10. Check and increment upload quota (atomic DB function)
  const { data: quotaOk, error: quotaError } = await serviceClient.rpc(
    'increment_upload_count',
    { org_id_input: appUser.org_id }
  )

  if (quotaError || !quotaOk) {
    return NextResponse.json(
      { error: 'Upload quota exceeded for your organization. Please contact support.' },
      { status: 429 }
    )
  }

  // 11. Upload to Supabase Storage using service role (not anon key)
  const docId = crypto.randomUUID()
  const storagePath = `${appUser.org_id}/${projectId}/${docId}/${sanitizedFilename}`
  const fileBuffer = await file.arrayBuffer()

  const { error: uploadError } = await serviceClient.storage
    .from('project-documents')
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    // Rollback quota on storage failure
    await serviceClient.rpc('decrement_upload_count', { org_id_input: appUser.org_id })
    console.error('Storage upload error:', uploadError)
    return NextResponse.json({ error: 'Failed to upload file to storage' }, { status: 500 })
  }

  // 12. Insert document metadata record
  const { data: doc, error: insertError } = await serviceClient
    .from('documents')
    .insert({
      id: docId,
      project_id: projectId,
      filename: sanitizedFilename,
      mime_type: file.type,
      storage_path: storagePath,
      tags: [],
      uploaded_by: authUser.id,
    })
    .select()
    .single()

  if (insertError) {
    // Best-effort cleanup of the uploaded storage file
    await serviceClient.storage.from('project-documents').remove([storagePath])
    await serviceClient.rpc('decrement_upload_count', { org_id_input: appUser.org_id })
    console.error('Document insert error:', insertError)
    return NextResponse.json({ error: 'Failed to create document record' }, { status: 500 })
  }

  // 13. Log audit event
  await serviceClient.from('audit_events').insert({
    project_id: projectId,
    actor_user_id: authUser.id,
    action: 'document_uploaded',
    entity_type: 'document',
    entity_id: doc.id,
    metadata_json: {
      filename: sanitizedFilename,
      mime_type: file.type,
      size_bytes: file.size,
    },
  })

  return NextResponse.json({
    id: doc.id,
    filename: doc.filename,
    mime_type: doc.mime_type,
    storage_path: doc.storage_path,
    uploaded_at: doc.uploaded_at,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { extractFromEmailAndPdf } from '@/lib/intake/gemini-extractor'
import { createProjectFromExtraction } from '@/lib/intake/project-creator'

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

interface PostmarkAttachment {
  Name: string
  Content: string // base64
  ContentType: string
  ContentLength: number
}

interface PostmarkInboundPayload {
  From: string
  Subject: string
  TextBody: string
  HtmlBody?: string
  Attachments: PostmarkAttachment[]
}

export async function POST(request: NextRequest) {
  // 1. Verify shared secret to authenticate Postmark
  const secret = request.nextUrl.searchParams.get('secret')
  const expectedSecret = process.env.POSTMARK_WEBHOOK_SECRET

  if (!expectedSecret || secret !== expectedSecret) {
    console.warn('Postmark webhook: invalid or missing secret')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse Postmark JSON payload
  let payload: PostmarkInboundPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { From, Subject, TextBody, Attachments = [] } = payload

  console.log(`Postmark intake: email from ${From}, subject: "${Subject}", attachments: ${Attachments.length}`)

  // 3. Find first PDF attachment
  const pdfAttachment = Attachments.find(
    (a) => a.ContentType === 'application/pdf' || a.Name?.toLowerCase().endsWith('.pdf')
  )

  if (!pdfAttachment) {
    // No PDF — acknowledge receipt so Postmark doesn't retry
    console.log('Postmark intake: no PDF attachment found, skipping')
    return NextResponse.json({ received: true, skipped: 'no_pdf' })
  }

  // 4. Decode base64 PDF
  const pdfBuffer = Buffer.from(pdfAttachment.Content, 'base64')

  if (pdfBuffer.byteLength > MAX_PDF_SIZE_BYTES) {
    console.warn(`Postmark intake: PDF too large (${pdfBuffer.byteLength} bytes), skipping`)
    return NextResponse.json({ received: true, skipped: 'pdf_too_large' })
  }

  // 5. Get org ID and look up first admin user
  const orgId = process.env.INTAKE_ORG_ID
  if (!orgId) {
    console.error('Postmark intake: INTAKE_ORG_ID env var not set')
    return NextResponse.json({ received: true, skipped: 'misconfigured' })
  }

  const serviceClient = await createServiceRoleClient()

  const { data: adminUser } = await serviceClient
    .from('app_users')
    .select('id')
    .eq('org_id', orgId)
    .eq('role', 'admin')
    .limit(1)
    .single()

  if (!adminUser) {
    console.error(`Postmark intake: no admin user found for org ${orgId}`)
    return NextResponse.json({ received: true, skipped: 'no_admin_user' })
  }

  // 6. Extract structured data with Gemini
  let extracted
  try {
    extracted = await extractFromEmailAndPdf(Subject, TextBody ?? '', From, pdfBuffer)
  } catch (err) {
    console.error('Postmark intake: Gemini extraction failed:', err)
    // Return 200 so Postmark doesn't retry — log the failure for manual review
    return NextResponse.json({ received: true, skipped: 'extraction_failed' })
  }

  // 7. Create project in Supabase
  let result
  try {
    result = await createProjectFromExtraction(
      serviceClient,
      adminUser.id,
      orgId,
      extracted,
      pdfBuffer,
      pdfAttachment.Name
    )
  } catch (err) {
    console.error('Postmark intake: project creation failed:', err)
    return NextResponse.json({ received: true, skipped: 'project_creation_failed' })
  }

  console.log(`Postmark intake: created project ${result.projectId} from email by ${From}`)

  return NextResponse.json({
    received: true,
    projectId: result.projectId,
    specRevisionId: result.specRevisionId,
    documentId: result.documentId,
  })
}

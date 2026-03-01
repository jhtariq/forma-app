import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { extractFromEmailAndPdf } from '@/lib/intake/gemini-extractor'
import { createProjectFromExtraction } from '@/lib/intake/project-creator'

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate — requires a logged-in user (used from the intake test page)
    const supabase = await createServerSupabaseClient()
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceClient = await createServiceRoleClient()

    // 2. Fetch app user for org context and role check
    const { data: appUser } = await serviceClient
      .from('app_users')
      .select('id, org_id, role')
      .eq('id', authUser.id)
      .single()

    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!['admin', 'member'].includes(appUser.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // 3. Parse multipart form data
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const emailSubject = (formData.get('emailSubject') as string | null) ?? ''
    const emailBody = (formData.get('emailBody') as string | null) ?? ''
    const senderEmail = (formData.get('senderEmail') as string | null) ?? ''
    const pdfFile = formData.get('pdfFile') as File | null

    if (!emailBody.trim() && !pdfFile) {
      return NextResponse.json(
        { error: 'Provide at least an email body or a PDF attachment' },
        { status: 400 }
      )
    }

    // 4. Read and validate PDF (optional)
    let pdfBuffer: Buffer | null = null
    let pdfFilename: string | null = null

    if (pdfFile) {
      if (pdfFile.type !== 'application/pdf') {
        return NextResponse.json({ error: 'Only PDF attachments are supported' }, { status: 400 })
      }
      if (pdfFile.size > MAX_PDF_SIZE_BYTES) {
        return NextResponse.json(
          { error: 'PDF exceeds maximum allowed size of 10 MB' },
          { status: 400 }
        )
      }

      const arrayBuffer = await pdfFile.arrayBuffer()
      pdfBuffer = Buffer.from(arrayBuffer)
      pdfFilename = pdfFile.name
    }

    // 5. Extract structured data with Gemini
    let extracted
    try {
      if (!pdfBuffer) {
        return NextResponse.json(
          { error: 'A PDF attachment is required for extraction' },
          { status: 400 }
        )
      }
      extracted = await extractFromEmailAndPdf(emailSubject, emailBody, senderEmail, pdfBuffer)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown extraction error'
      console.error('Gemini extraction error:', err)
      return NextResponse.json(
        { error: `Extraction failed: ${message}` },
        { status: 502 }
      )
    }

    // 6. Create project, spec revision, and document in Supabase
    let result
    try {
      result = await createProjectFromExtraction(
        serviceClient,
        authUser.id,
        appUser.org_id,
        extracted,
        pdfBuffer,
        pdfFilename
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('Project creation error:', err)
      return NextResponse.json(
        { error: `Project creation failed: ${message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      projectId: result.projectId,
      specRevisionId: result.specRevisionId,
      documentId: result.documentId,
      extracted,
    })
  } catch (err) {
    console.error('Unexpected error in email intake route:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/hooks/use-auth'
import { canCreateProject } from '@/lib/permissions'
import type { ExtractedOrderData } from '@/lib/intake/gemini-extractor'

interface IntakeResult {
  projectId: string
  specRevisionId: string
  documentId: string | null
  extracted: ExtractedOrderData
}

export default function IntakeTestPage() {
  const { user } = useAuth()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<IntakeResult | null>(null)

  if (!user || !canCreateProject(user.role)) {
    return (
      <div className="text-neutral-400 text-sm py-12 text-center">
        You don&apos;t have permission to access this page.
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)

    if (!pdfFile) {
      setError('Please attach a PDF file.')
      return
    }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('emailSubject', emailSubject)
      formData.append('emailBody', emailBody)
      formData.append('senderEmail', senderEmail)
      formData.append('pdfFile', pdfFile)

      const res = await fetch('/api/intake/email', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Unknown error')
        return
      }

      setResult(data as IntakeResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const extractedFields = result
    ? Object.entries(result.extracted).filter(([, v]) => v !== null && v !== '')
    : []

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-100">Agentic Email Intake</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Simulate an inbound vendor email with a PDF attachment. The system will
          extract order details and create a new project automatically.
        </p>
      </div>

      {!result ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-medium text-neutral-300">Email Details</h2>

            <div className="space-y-2">
              <label className="text-xs text-neutral-400">Sender Email</label>
              <Input
                type="email"
                placeholder="vendor@supplier.com"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-neutral-400">Subject</label>
              <Input
                placeholder="Q3 Order Spec — Style #FW-24 Autumn Collection"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-neutral-400">Email Body</label>
              <Textarea
                placeholder="Hi, please find attached our order specification for the upcoming season..."
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={5}
                className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-500 resize-none"
              />
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-medium text-neutral-300">PDF Attachment</h2>
            <p className="text-xs text-neutral-500">
              Attach the order spec or purchase order PDF. Max 10 MB.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
            />

            {pdfFile ? (
              <div className="flex items-center gap-3 p-3 bg-neutral-800 rounded border border-neutral-700">
                <span className="text-xs text-neutral-300 flex-1 truncate">{pdfFile.name}</span>
                <span className="text-xs text-neutral-500">
                  {(pdfFile.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPdfFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="text-neutral-500 hover:text-neutral-300 text-xs"
                >
                  Remove
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              >
                Choose PDF
              </Button>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-950 border border-red-800 rounded text-sm text-red-300">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !pdfFile}
            className="w-full bg-neutral-100 text-neutral-900 hover:bg-white disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Process Email & Create Project'}
          </Button>
        </form>
      ) : (
        <div className="space-y-5">
          {/* Success banner */}
          <div className="p-4 bg-green-950 border border-green-800 rounded-lg">
            <p className="text-sm font-medium text-green-300">Project created successfully</p>
            <p className="text-xs text-green-500 mt-0.5">
              {extractedFields.length} field{extractedFields.length !== 1 ? 's' : ''} extracted
              {result.documentId ? ', PDF attached' : ''}
            </p>
          </div>

          {/* Extracted fields preview */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-medium text-neutral-300">Extracted Fields</h2>
            <div className="space-y-2">
              {extractedFields.map(([key, value]) => (
                <div key={key} className="flex gap-3 text-xs">
                  <span className="text-neutral-500 w-40 shrink-0 capitalize">
                    {key.replace(/_/g, ' ')}
                  </span>
                  <span className="text-neutral-200 break-words">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={() => router.push(`/projects/${result.projectId}`)}
              className="flex-1 bg-neutral-100 text-neutral-900 hover:bg-white"
            >
              Open Project
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setResult(null)
                setError(null)
                setEmailSubject('')
                setEmailBody('')
                setSenderEmail('')
                setPdfFile(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            >
              Process Another
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

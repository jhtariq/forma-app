'use client'

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { canUploadDocuments } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { DOCUMENT_TAGS } from '@/lib/constants'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Upload,
  FileText,
  ImageIcon,
  Table2,
  Download,
  Eye,
  X,
  Tag,
} from 'lucide-react'

export function DocumentsTab({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<string | null>(null)
  const [editingDoc, setEditingDoc] = useState<string | null>(null)
  const [editTags, setEditTags] = useState<string[]>([])
  const [editNotes, setEditNotes] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const { data: documents } = useQuery({
    queryKey: ['documents', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*, app_users!documents_uploaded_by_fkey(name)')
        .eq('project_id', projectId)
        .order('uploaded_at', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  const uploadFile = useCallback(
    async (file: File) => {
      if (!user) return
      setUploading(true)

      try {
        const docId = crypto.randomUUID()
        const storagePath = `${user.org_id}/${projectId}/${docId}/${file.name}`

        const { error: uploadError } = await supabase.storage
          .from('project-documents')
          .upload(storagePath, file)

        if (uploadError) throw uploadError

        const { data: doc, error: insertError } = await supabase
          .from('documents')
          .insert({
            id: docId,
            project_id: projectId,
            filename: file.name,
            mime_type: file.type,
            storage_path: storagePath,
            tags: [],
            uploaded_by: user.id,
          })
          .select()
          .single()

        if (insertError) throw insertError

        await logAuditEvent(supabase, {
          project_id: projectId,
          actor_user_id: user.id,
          action: 'document_uploaded',
          entity_type: 'document',
          entity_id: doc.id,
          metadata_json: { filename: file.name },
        })

        queryClient.invalidateQueries({ queryKey: ['documents', projectId] })
        toast.success(`Uploaded ${file.name}`)
      } catch (err) {
        console.error(err)
        toast.error(`Failed to upload ${file.name}`)
      } finally {
        setUploading(false)
      }
    },
    [user, supabase, projectId, queryClient]
  )

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      Array.from(files).forEach(uploadFile)
    }
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    Array.from(files).forEach(uploadFile)
  }

  const openPreview = async (doc: { storage_path: string; mime_type: string; filename: string }) => {
    const { data } = await supabase.storage
      .from('project-documents')
      .createSignedUrl(doc.storage_path, 3600)

    if (data?.signedUrl) {
      if (doc.mime_type.startsWith('image/') || doc.mime_type === 'application/pdf') {
        setPreviewDoc(data.signedUrl)
      } else {
        window.open(data.signedUrl, '_blank')
      }
    }
  }

  const handleDownload = async (doc: { storage_path: string; filename: string }) => {
    const { data } = await supabase.storage
      .from('project-documents')
      .createSignedUrl(doc.storage_path, 3600, { download: doc.filename })

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
    }
  }

  const startEditDoc = (doc: { id: string; tags: string[]; notes: string | null }) => {
    setEditingDoc(doc.id)
    setEditTags(doc.tags ?? [])
    setEditNotes(doc.notes ?? '')
  }

  const saveDocEdit = async () => {
    if (!editingDoc) return

    const { error } = await supabase
      .from('documents')
      .update({ tags: editTags, notes: editNotes })
      .eq('id', editingDoc)

    if (error) {
      toast.error('Failed to update document')
      return
    }

    queryClient.invalidateQueries({ queryKey: ['documents', projectId] })
    setEditingDoc(null)
    toast.success('Document updated')
  }

  const toggleTag = (tag: string) => {
    setEditTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-blue-400" />
    if (mimeType === 'application/pdf') return <FileText className="h-4 w-4 text-red-400" />
    return <Table2 className="h-4 w-4 text-green-400" />
  }

  return (
    <div className="space-y-4">
      {/* Upload area */}
      {user && canUploadDocuments(user.role) && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragOver
              ? 'border-orange-500 bg-orange-500/5'
              : 'border-neutral-700 hover:border-neutral-600'
          }`}
        >
          <Upload className="h-8 w-8 mx-auto text-neutral-500 mb-2" />
          <p className="text-sm text-neutral-400 mb-2">
            {uploading ? 'Uploading...' : 'Drag & drop files here, or click to browse'}
          </p>
          <p className="text-xs text-neutral-500 mb-3">
            PDF, PNG, JPG, CSV, XLSX
          </p>
          <label>
            <Button
              variant="outline"
              size="sm"
              disabled={uploading}
              className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              asChild
            >
              <span>Choose Files</span>
            </Button>
            <input
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls"
              onChange={handleFileInput}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Documents list */}
      <div className="space-y-2">
        {documents?.map((doc: any) => (
          <div
            key={doc.id}
            className="flex items-center justify-between p-3 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-900"
          >
            <div className="flex items-center gap-3 min-w-0">
              {getFileIcon(doc.mime_type)}
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-200 truncate">
                  {doc.filename}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-neutral-500">
                    {doc.app_users?.name} · {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}
                  </span>
                  {doc.tags?.map((tag: string) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-[10px] border-neutral-700 text-neutral-400 px-1.5 py-0"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-neutral-400 hover:text-neutral-100"
                onClick={() => openPreview(doc)}
                title="Preview"
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-neutral-400 hover:text-neutral-100"
                onClick={() => handleDownload(doc)}
                title="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-neutral-400 hover:text-neutral-100"
                onClick={() => startEditDoc(doc)}
                title="Edit tags"
              >
                <Tag className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {documents?.length === 0 && (
          <div className="text-center py-8 text-neutral-500 text-sm">
            No documents uploaded yet
          </div>
        )}
      </div>

      {/* Preview dialog */}
      {previewDoc && (
        <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
          <DialogContent className="bg-neutral-900 border-neutral-700 max-w-4xl max-h-[85vh] overflow-auto">
            <DialogHeader>
              <DialogTitle className="text-neutral-100">Document Preview</DialogTitle>
            </DialogHeader>
            {previewDoc.includes('.pdf') || previewDoc.includes('application/pdf') ? (
              <iframe src={previewDoc} className="w-full h-[70vh] rounded" />
            ) : (
              <img src={previewDoc} alt="Preview" className="max-w-full rounded" />
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Edit tags dialog */}
      <Dialog open={!!editingDoc} onOpenChange={() => setEditingDoc(null)}>
        <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-neutral-300">Tags</p>
              <div className="flex flex-wrap gap-2">
                {DOCUMENT_TAGS.map((tag) => (
                  <Badge
                    key={tag}
                    variant={editTags.includes(tag) ? 'default' : 'outline'}
                    className={`cursor-pointer text-xs ${
                      editTags.includes(tag)
                        ? 'bg-orange-600 text-white hover:bg-orange-700'
                        : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800'
                    }`}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-neutral-300">Notes</p>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Optional notes..."
                className="bg-neutral-800 border-neutral-700 text-neutral-100"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditingDoc(null)}
              className="text-neutral-400"
            >
              Cancel
            </Button>
            <Button
              onClick={saveDocEdit}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

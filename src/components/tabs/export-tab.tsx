'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { canExport } from '@/lib/permissions'
import { DOCUMENT_TAGS } from '@/lib/constants'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Download, FileArchive, Loader2, AlertCircle } from 'lucide-react'

export function ExportTab({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [selectedTags, setSelectedTags] = useState<Set<string>>(
    new Set(DOCUMENT_TAGS)
  )
  const [generating, setGenerating] = useState(false)

  // Fetch approved revisions
  const { data: approvalData } = useQuery({
    queryKey: ['export-approvals', projectId],
    queryFn: async () => {
      const { data: specApproved } = await supabase
        .from('approval_requests')
        .select('spec_revision_id, spec_revision:spec_revisions(id, version_int)')
        .eq('project_id', projectId)
        .eq('entity_type', 'spec')
        .eq('status', 'approved')
        .order('requested_at', { ascending: false })
        .limit(1)

      const { data: bomApproved } = await supabase
        .from('approval_requests')
        .select('bom_revision_id, bom_revision:bom_revisions(id, version_int)')
        .eq('project_id', projectId)
        .eq('entity_type', 'bom')
        .eq('status', 'approved')
        .order('requested_at', { ascending: false })
        .limit(1)

      return {
        specRevision: specApproved?.[0]?.spec_revision,
        bomRevision: bomApproved?.[0]?.bom_revision,
      }
    },
    enabled: !!user,
  })

  // Fetch export history
  const { data: exports } = useQuery({
    queryKey: ['exports', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('export_packs')
        .select('*, app_users!export_packs_generated_by_fkey(name)')
        .eq('project_id', projectId)
        .order('generated_at', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const hasApprovedSpec = !!approvalData?.specRevision
  const hasApprovedBom = !!approvalData?.bomRevision
  const canGenerate = hasApprovedSpec || hasApprovedBom

  const handleGenerate = async () => {
    if (!user) return
    setGenerating(true)

    try {
      const res = await fetch(`/api/exports/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedTags: Array.from(selectedTags),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Export failed')
      }

      const data = await res.json()

      queryClient.invalidateQueries({ queryKey: ['exports', projectId] })
      queryClient.invalidateQueries({ queryKey: ['audit', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })

      toast.success('Export generated successfully')

      // Download
      if (data.downloadUrl) {
        window.open(data.downloadUrl, '_blank')
      }
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to generate export')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownloadExport = async (storagePath: string) => {
    const { data } = await supabase.storage
      .from('project-exports')
      .createSignedUrl(storagePath, 3600, { download: true })

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
    }
  }

  return (
    <div className="space-y-4">
      {/* Export generator */}
      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-neutral-100 text-lg">
            Generate Audit / Compliance Pack
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Approval status */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className={`p-3 rounded-lg border ${
                hasApprovedSpec
                  ? 'bg-green-950/20 border-green-800/50'
                  : 'bg-neutral-800 border-neutral-700'
              }`}
            >
              <p className="text-xs text-neutral-400 mb-1">Spec</p>
              {hasApprovedSpec ? (
                <p className="text-sm text-green-400">
                  v{(approvalData?.specRevision as unknown as { version_int: number })?.version_int} approved
                </p>
              ) : (
                <p className="text-sm text-neutral-500 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  No approved revision
                </p>
              )}
            </div>
            <div
              className={`p-3 rounded-lg border ${
                hasApprovedBom
                  ? 'bg-green-950/20 border-green-800/50'
                  : 'bg-neutral-800 border-neutral-700'
              }`}
            >
              <p className="text-xs text-neutral-400 mb-1">BOM</p>
              {hasApprovedBom ? (
                <p className="text-sm text-green-400">
                  v{(approvalData?.bomRevision as unknown as { version_int: number })?.version_int} approved
                </p>
              ) : (
                <p className="text-sm text-neutral-500 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  No approved revision
                </p>
              )}
            </div>
          </div>

          {/* Document tag filter */}
          <div>
            <p className="text-sm text-neutral-300 mb-2">
              Include documents with tags:
            </p>
            <div className="flex flex-wrap gap-2">
              {DOCUMENT_TAGS.map((tag) => (
                <Badge
                  key={tag}
                  variant={selectedTags.has(tag) ? 'default' : 'outline'}
                  className={`cursor-pointer text-xs ${
                    selectedTags.has(tag)
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

          {/* Generate button */}
          {user && canExport(user.role) && (
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileArchive className="h-4 w-4 mr-1.5" />
                  Generate Export Pack
                </>
              )}
            </Button>
          )}

          {!canGenerate && (
            <p className="text-xs text-amber-400">
              At least one approved Spec or BOM revision is required to generate an export.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Export history */}
      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-neutral-100 text-sm">Export History</CardTitle>
        </CardHeader>
        <CardContent>
          {exports?.length === 0 && (
            <p className="text-neutral-500 text-sm">No exports generated yet</p>
          )}
          <div className="space-y-2">
            {exports?.map((exp: any) => (
              <div
                key={exp.id}
                className="flex items-center justify-between py-2 px-3 rounded hover:bg-neutral-800/50"
              >
                <div>
                  <p className="text-sm text-neutral-300">
                    Export Pack
                  </p>
                  <p className="text-xs text-neutral-500">
                    {exp.app_users?.name} ·{' '}
                    {format(new Date(exp.generated_at), 'MMM d, yyyy HH:mm')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadExport(exp.storage_path)}
                  className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown, ChevronRight, GitCompare, Eye, History } from 'lucide-react'
import type { TshirtParams } from '@/lib/cad'

interface CadVersion {
  id: string
  sku_id: string
  version_int: number
  parameter_snapshot: TshirtParams
  svg_content: string
  diff_summary: string | null
  notes: string | null
  created_by: string
  created_at: string
  app_users: { name: string } | null
}

const PARAM_LABELS: Record<string, string> = {
  chest_circumference_mm: 'Chest Circumference (mm)',
  shoulder_width_mm: 'Shoulder Width (mm)',
  body_length_mm: 'Body Length (mm)',
  sleeve_length_mm: 'Sleeve Length (mm)',
  neck_width_mm: 'Neck Width (mm)',
  ease_mm: 'Ease (mm)',
  seam_allowance_mm: 'Seam Allowance (mm)',
  sleeve_type: 'Sleeve Type',
  neckline_type: 'Neckline Type',
}

export function VersionHistory({ skuId }: { skuId: string }) {
  const { user } = useAuth()
  const supabase = createClient()
  const [isOpen, setIsOpen] = useState(true)
  const [previewVersion, setPreviewVersion] = useState<CadVersion | null>(null)
  const [compareVersions, setCompareVersions] = useState<{ left: CadVersion; right: CadVersion } | null>(null)

  const { data: versions } = useQuery({
    queryKey: ['cad-versions', skuId],
    queryFn: async () => {
      const { data } = await supabase
        .from('cad_versions')
        .select('*, app_users!cad_versions_created_by_fkey(name)')
        .eq('sku_id', skuId)
        .order('version_int', { ascending: false })

      return (data ?? []) as CadVersion[]
    },
    enabled: !!user,
  })

  if (!versions || versions.length === 0) {
    return null
  }

  const handleCompare = (version: CadVersion) => {
    // Compare with the previous version
    const idx = versions.findIndex((v) => v.id === version.id)
    const prevVersion = versions[idx + 1]
    if (prevVersion) {
      setCompareVersions({ left: prevVersion, right: version })
    }
  }

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex items-center justify-between px-0 text-neutral-300 hover:text-neutral-100">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4" />
              <span className="font-medium">Version History ({versions.length})</span>
            </div>
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2 mt-3">
            {versions.map((version) => (
              <Card key={version.id} className="bg-neutral-900/50 border-neutral-800">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-orange-400 border-orange-400/30 text-xs">
                          v{version.version_int}
                        </Badge>
                        <span className="text-sm text-neutral-300">
                          {version.app_users?.name || 'Unknown'}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {format(new Date(version.created_at), 'MMM d, yyyy HH:mm')}
                        </span>
                      </div>
                      {version.diff_summary && (
                        <p className="text-xs text-neutral-500">{version.diff_summary}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-neutral-400 hover:text-neutral-100 h-7 px-2"
                        onClick={() => setPreviewVersion(version)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {version.version_int > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-neutral-400 hover:text-neutral-100 h-7 px-2"
                          onClick={() => handleCompare(version)}
                        >
                          <GitCompare className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Preview Dialog */}
      <Dialog open={!!previewVersion} onOpenChange={() => setPreviewVersion(null)}>
        <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-3xl">
          <DialogHeader>
            <DialogTitle>Version {previewVersion?.version_int} Preview</DialogTitle>
          </DialogHeader>
          {previewVersion && (
            <div
              className="bg-neutral-950 rounded-lg p-4 overflow-auto max-h-[60vh]"
              dangerouslySetInnerHTML={{ __html: previewVersion.svg_content }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Compare Dialog */}
      <Dialog open={!!compareVersions} onOpenChange={() => setCompareVersions(null)}>
        <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              Compare v{compareVersions?.left.version_int} → v{compareVersions?.right.version_int}
            </DialogTitle>
          </DialogHeader>
          {compareVersions && (
            <div className="space-y-6">
              {/* Parameter comparison table */}
              <Card className="bg-neutral-950 border-neutral-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-neutral-300">Parameters</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="font-medium text-neutral-500">Parameter</div>
                    <div className="font-medium text-neutral-500">v{compareVersions.left.version_int}</div>
                    <div className="font-medium text-neutral-500">v{compareVersions.right.version_int}</div>

                    {Object.keys(PARAM_LABELS).map((key) => {
                      const oldVal = (compareVersions.left.parameter_snapshot as unknown as Record<string, unknown>)[key]
                      const newVal = (compareVersions.right.parameter_snapshot as unknown as Record<string, unknown>)[key]
                      const changed = oldVal !== newVal

                      return (
                        <div key={key} className="contents">
                          <div className="text-neutral-400 py-1">{PARAM_LABELS[key]}</div>
                          <div className={`py-1 ${changed ? 'text-red-400' : 'text-neutral-300'}`}>
                            {String(oldVal ?? '—')}
                          </div>
                          <div className={`py-1 ${changed ? 'text-green-400 font-medium' : 'text-neutral-300'}`}>
                            {String(newVal ?? '—')}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* SVG comparison */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-neutral-500 mb-2">v{compareVersions.left.version_int}</p>
                  <div
                    className="bg-neutral-950 rounded-lg p-2 overflow-auto max-h-[40vh]"
                    dangerouslySetInnerHTML={{ __html: compareVersions.left.svg_content }}
                  />
                </div>
                <div>
                  <p className="text-xs text-neutral-500 mb-2">v{compareVersions.right.version_int}</p>
                  <div
                    className="bg-neutral-950 rounded-lg p-2 overflow-auto max-h-[40vh]"
                    dangerouslySetInnerHTML={{ __html: compareVersions.right.svg_content }}
                  />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

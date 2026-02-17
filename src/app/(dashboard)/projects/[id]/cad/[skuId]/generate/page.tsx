'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { canGenerateCad } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { CAD_PARAM_FIELDS } from '@/lib/constants'
import { validateTshirtParams } from '@/lib/cad/validate'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { VersionHistory } from '@/components/cad/version-history'
import { ArrowLeft, Loader2, Download, FolderInput, Ruler } from 'lucide-react'
import type { TshirtParams } from '@/lib/cad'
import type { Json } from '@/lib/types/database'

const DEFAULT_PARAMS: TshirtParams = {
  chest_circumference_mm: 1000,
  shoulder_width_mm: 460,
  body_length_mm: 720,
  sleeve_length_mm: 250,
  neck_width_mm: 180,
  ease_mm: 80,
  seam_allowance_mm: 10,
  sleeve_type: 'short',
  neckline_type: 'crew',
}

export default function CadGeneratePage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const projectId = params.id as string
  const skuId = params.skuId as string

  const [formParams, setFormParams] = useState<TshirtParams>(DEFAULT_PARAMS)
  const [generating, setGenerating] = useState(false)
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [currentVersion, setCurrentVersion] = useState<number | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [pushing, setPushing] = useState(false)

  // Fetch SKU info
  const { data: sku } = useQuery({
    queryKey: ['sku', skuId],
    queryFn: async () => {
      const { data } = await supabase
        .from('skus')
        .select('*')
        .eq('id', skuId)
        .single()
      return data
    },
    enabled: !!user,
  })

  // Fetch latest version to pre-fill params
  const { data: latestVersion } = useQuery({
    queryKey: ['cad-versions-latest', skuId],
    queryFn: async () => {
      const { data } = await supabase
        .from('cad_versions')
        .select('*')
        .eq('sku_id', skuId)
        .order('version_int', { ascending: false })
        .limit(1)

      return data && data.length > 0 ? data[0] : null
    },
    enabled: !!user,
  })

  // Pre-fill from latest version
  useEffect(() => {
    if (latestVersion?.parameter_snapshot) {
      setFormParams(latestVersion.parameter_snapshot as TshirtParams)
      setSvgContent(latestVersion.svg_content)
      setCurrentVersion(latestVersion.version_int)
    }
  }, [latestVersion])

  const updateParam = (key: string, value: string | number) => {
    setFormParams((prev) => ({ ...prev, [key]: value }))
    setErrors([])
  }

  const handleGenerate = async () => {
    // Client-side validation
    const validation = validateTshirtParams(formParams)
    if (!validation.valid) {
      setErrors(validation.errors)
      return
    }

    setGenerating(true)
    setErrors([])

    try {
      const response = await fetch('/api/cad/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          skuId,
          params: formParams,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        if (result.errors) {
          setErrors(result.errors)
        } else {
          toast.error(result.error || 'Generation failed')
        }
        return
      }

      setSvgContent(result.svgContent)
      setCurrentVersion(result.version)
      queryClient.invalidateQueries({ queryKey: ['cad-versions', skuId] })
      queryClient.invalidateQueries({ queryKey: ['cad-versions-latest', skuId] })
      queryClient.invalidateQueries({ queryKey: ['skus', projectId] })
      queryClient.invalidateQueries({ queryKey: ['audit', projectId] })
      toast.success(`Pattern v${result.version} generated`)
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate pattern')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async (type: 'dxf' | 'svg') => {
    if (!latestVersion) return

    const path = type === 'dxf' ? latestVersion.dxf_storage_path : latestVersion.svg_storage_path
    const { data } = await supabase.storage
      .from('project-documents')
      .createSignedUrl(path, 3600, { download: true })

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
    } else {
      toast.error('Failed to generate download link')
    }
  }

  const handlePushToDocuments = async () => {
    if (!user || !latestVersion || !sku) return
    setPushing(true)

    try {
      const { data: doc, error } = await supabase
        .from('documents')
        .insert({
          project_id: projectId,
          filename: `${sku.name}-v${latestVersion.version_int}-pattern.dxf`,
          mime_type: 'application/dxf',
          storage_bucket: 'project-documents',
          storage_path: latestVersion.dxf_storage_path,
          tags: ['Spec'],
          notes: `CAD pattern for ${sku.name} v${latestVersion.version_int}`,
          uploaded_by: user.id,
        })
        .select()
        .single()

      if (error) throw error

      await logAuditEvent(supabase, {
        project_id: projectId,
        actor_user_id: user.id,
        action: 'cad_pushed_to_documents',
        entity_type: 'document',
        entity_id: doc.id,
        metadata_json: {
          sku_name: sku.name,
          version: latestVersion.version_int,
        } as unknown as Json,
      })

      queryClient.invalidateQueries({ queryKey: ['documents', projectId] })
      queryClient.invalidateQueries({ queryKey: ['audit', projectId] })
      toast.success('Pattern added to project documents')
    } catch (err) {
      console.error(err)
      toast.error('Failed to push to documents')
    } finally {
      setPushing(false)
    }
  }

  const canEdit = user ? canGenerateCad(user.role) : false

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Back link */}
      <Button
        variant="ghost"
        onClick={() => router.push(`/projects/${projectId}`)}
        className="text-neutral-400 hover:text-neutral-100 mb-4 -ml-2"
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Back to Project
      </Button>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Ruler className="h-6 w-6 text-orange-500" />
        <h1 className="text-xl font-bold text-neutral-100">
          {sku?.name || 'Loading...'}
        </h1>
        {currentVersion && (
          <Badge variant="outline" className="text-orange-400 border-orange-400/30">
            v{currentVersion}
          </Badge>
        )}
      </div>

      {/* Main layout: left form, right preview */}
      <div className="flex gap-6" style={{ minHeight: '600px' }}>
        {/* Left: Form (40%) */}
        <div className="w-[40%] space-y-6">
          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader>
              <CardTitle className="text-neutral-100 text-sm">Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {CAD_PARAM_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">
                    {field.label}
                    {field.required && <span className="text-red-400 ml-0.5">*</span>}
                  </Label>
                  {field.type === 'number' ? (
                    <Input
                      type="number"
                      value={(formParams as unknown as Record<string, unknown>)[field.key] as number || ''}
                      onChange={(e) => updateParam(field.key, parseFloat(e.target.value) || 0)}
                      className="bg-neutral-800 border-neutral-700 text-neutral-200 h-9"
                      disabled={!canEdit}
                    />
                  ) : (
                    <Select
                      value={((formParams as unknown as Record<string, unknown>)[field.key] as string) || ''}
                      onValueChange={(val) => updateParam(field.key, val)}
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-200 h-9">
                        <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent className="bg-neutral-800 border-neutral-700">
                        {'options' in field && field.options?.map((opt) => (
                          <SelectItem
                            key={opt}
                            value={opt}
                            className="text-neutral-200 focus:bg-neutral-700 focus:text-neutral-100"
                          >
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}

              {/* Validation errors */}
              {errors.length > 0 && (
                <div className="bg-red-950/50 border border-red-800 rounded-md p-3 space-y-1">
                  {errors.map((err, i) => (
                    <p key={i} className="text-red-400 text-xs">{err}</p>
                  ))}
                </div>
              )}

              {/* Generate button */}
              {canEdit && (
                <Button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    'Generate Pattern'
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Version History */}
          <VersionHistory skuId={skuId} />
        </div>

        {/* Right: Preview (60%) */}
        <div className="w-[60%]">
          <Card className="bg-neutral-900 border-neutral-800 h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-neutral-100 text-sm">Pattern Preview</CardTitle>
                {svgContent && latestVersion && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload('svg')}
                      className="text-neutral-400 hover:text-neutral-100 h-7 text-xs"
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      SVG
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload('dxf')}
                      className="text-neutral-400 hover:text-neutral-100 h-7 text-xs"
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      DXF
                    </Button>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handlePushToDocuments}
                        disabled={pushing}
                        className="text-orange-400 hover:text-orange-300 h-7 text-xs"
                      >
                        <FolderInput className="h-3.5 w-3.5 mr-1" />
                        {pushing ? 'Pushing...' : 'Push to Documents'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              {svgContent ? (
                <div
                  className="bg-neutral-950 rounded-lg p-4 overflow-auto"
                  style={{ maxHeight: 'calc(100vh - 280px)' }}
                  dangerouslySetInnerHTML={{ __html: svgContent }}
                />
              ) : (
                <div className="bg-neutral-950 rounded-lg flex items-center justify-center" style={{ minHeight: '500px' }}>
                  <div className="text-center">
                    <Ruler className="h-16 w-16 text-neutral-700 mx-auto mb-4" />
                    <p className="text-neutral-500 text-sm">
                      Fill in parameters and click Generate to preview pattern pieces.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { canGenerateCad } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { CAD_PARAM_SECTIONS, COLOR_SWATCHES, CAD_DEFAULT_PARAMS } from '@/lib/constants'
import { validateTshirtParams, computeDerivedParams } from '@/lib/cad'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VersionHistory } from '@/components/cad/version-history'
import {
  ArrowLeft,
  Loader2,
  Download,
  FolderInput,
  Ruler,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Package,
  Box,
} from 'lucide-react'
import type { TshirtParams } from '@/lib/cad'
import type { DerivedParams } from '@/lib/cad'
import type { Json } from '@/lib/types/database'
import dynamic from 'next/dynamic'

// Dynamic import to avoid SSR issues with Three.js
const TshirtPreview3D = dynamic(
  () => import('@/components/cad/tshirt-3d-preview'),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <Loader2 className="h-6 w-6 text-orange-500 animate-spin" />
    </div>
  )}
)

// ─── Color swatch picker ──────────────────────────────────────────────────────
function ColorSwatchPicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-neutral-400 text-xs">{label}</Label>
      <div className="flex flex-wrap gap-2">
        {COLOR_SWATCHES.map((swatch) => (
          <button
            key={swatch.hex}
            type="button"
            disabled={disabled}
            onClick={() => onChange(swatch.hex)}
            title={swatch.name}
            className={`w-7 h-7 rounded-full border-2 transition-all ${
              value === swatch.hex
                ? 'border-orange-500 scale-110'
                : 'border-neutral-600 hover:border-neutral-400'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            style={{ backgroundColor: swatch.hex }}
          />
        ))}
      </div>
      <p className="text-neutral-600 text-[10px]">{COLOR_SWATCHES.find(s => s.hex === value)?.name || value}</p>
    </div>
  )
}

// ─── Derived params display ───────────────────────────────────────────────────
function DerivedParamsSection({ params }: { params: Partial<TshirtParams> }) {
  const [open, setOpen] = useState(false)
  const derived = useMemo(() => computeDerivedParams(params), [params])

  const displayFields: { label: string; key: keyof DerivedParams; unit: string }[] = [
    { label: 'Armhole Depth', key: 'armhole_depth_mm', unit: 'mm' },
    { label: 'Sleeve Cap Height', key: 'sleeve_cap_height_mm', unit: 'mm' },
    { label: 'Armhole Scale', key: 'armhole_curve_template_scale', unit: '' },
    { label: 'Neckband Length Ratio', key: 'neckband_length_ratio', unit: '' },
  ]

  return (
    <div className="border border-neutral-800 rounded-md">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-neutral-400 hover:text-neutral-200 text-xs"
        onClick={() => setOpen(!open)}
      >
        <span className="font-medium">Derived Parameters (auto)</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="px-3 pb-3 grid grid-cols-2 gap-2">
          {displayFields.map(f => (
            <div key={f.key} className="bg-neutral-800/50 rounded px-2 py-1.5">
              <p className="text-neutral-500 text-[10px]">{f.label}</p>
              <p className="text-neutral-300 text-xs font-mono">
                {typeof derived[f.key] === 'number'
                  ? `${(derived[f.key] as number).toFixed(2)}${f.unit}`
                  : '—'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CadGeneratePage() {
  const routeParams = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const projectId = routeParams.id as string
  const skuId = routeParams.skuId as string

  const [formParams, setFormParams] = useState<TshirtParams>({ ...CAD_DEFAULT_PARAMS })
  const [generating, setGenerating] = useState(false)
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [techSketchSvg, setTechSketchSvg] = useState<string | null>(null)
  const [currentVersion, setCurrentVersion] = useState<number | null>(null)
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [pushing, setPushing] = useState(false)
  const [sleeveCapAdjusted, setSleeveCapAdjusted] = useState(false)
  const [sleeveCapAdjustmentMm, setSleeveCapAdjustmentMm] = useState(0)
  const [downloadingPack, setDownloadingPack] = useState(false)
  const [pocketOpen, setPocketOpen] = useState(false)

  // Fetch SKU info
  const { data: sku } = useQuery({
    queryKey: ['sku', skuId],
    queryFn: async () => {
      const { data } = await supabase.from('skus').select('*').eq('id', skuId).single()
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
      setCurrentVersionId(latestVersion.id)
      if ((latestVersion.parameter_snapshot as TshirtParams).pocket_enabled) {
        setPocketOpen(true)
      }
    }
  }, [latestVersion])

  const updateParam = (key: string, value: string | number | boolean) => {
    setFormParams((prev) => ({ ...prev, [key]: value }))
    setErrors([])
  }

  const handleGenerate = async () => {
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
        body: JSON.stringify({ projectId, skuId, params: formParams }),
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
      setTechSketchSvg(result.techSketchSvg)
      setCurrentVersion(result.version)
      setCurrentVersionId(result.cadVersionId)
      setSleeveCapAdjusted(result.sleeveCapAdjusted ?? false)
      setSleeveCapAdjustmentMm(result.sleeveCapAdjustmentMm ?? 0)
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

  const handleDownloadPack = async () => {
    if (!currentVersionId) return
    setDownloadingPack(true)
    try {
      const response = await fetch(`/api/cad/${currentVersionId}/manufacturing-pack`)
      const result = await response.json()
      if (!response.ok || !result.url) {
        toast.error(result.error || 'Failed to get download URL')
        return
      }
      window.open(result.url, '_blank')
    } catch {
      toast.error('Download failed')
    } finally {
      setDownloadingPack(false)
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
  const pocketEnabled = !!formParams.pocket_enabled

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
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
        <h1 className="text-xl font-bold text-neutral-100">{sku?.name || 'Loading...'}</h1>
        {currentVersion && (
          <Badge variant="outline" className="text-orange-400 border-orange-400/30">
            v{currentVersion}
          </Badge>
        )}
      </div>

      {/* Sleeve cap adjusted banner */}
      {sleeveCapAdjusted && (
        <div className="flex items-center gap-2 bg-amber-950/40 border border-amber-800/50 rounded-md px-4 py-2.5 mb-4 text-amber-400 text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Sleeve cap auto-corrected by {sleeveCapAdjustmentMm > 0 ? '+' : ''}{sleeveCapAdjustmentMm.toFixed(1)}mm for armhole match
        </div>
      )}

      {/* Main layout: left form 40% / right preview 60% */}
      <div className="flex gap-6" style={{ minHeight: '600px' }}>
        {/* ── Left form panel (40%) ── */}
        <div className="w-[40%] space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          {/* Param sections */}
          {CAD_PARAM_SECTIONS.map((section) => {
            if (section.collapsible) {
              const isOpen = pocketOpen
              return (
                <Card key={section.section} className="bg-neutral-900 border-neutral-800">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-3 text-neutral-300 hover:text-neutral-100 text-sm font-medium"
                    onClick={() => setPocketOpen(!isOpen)}
                  >
                    {section.section}
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  {isOpen && (
                    <CardContent className="space-y-3 pt-0">
                      {section.fields.map((field) => {
                        if (field.conditional && !pocketEnabled) return null
                        return (
                          <FieldRow
                            key={field.key}
                            field={field}
                            formParams={formParams}
                            updateParam={updateParam}
                            canEdit={canEdit}
                          />
                        )
                      })}
                    </CardContent>
                  )}
                </Card>
              )
            }

            return (
              <Card key={section.section} className="bg-neutral-900 border-neutral-800">
                <CardHeader className="pb-2 pt-3">
                  <CardTitle className="text-neutral-400 text-xs font-medium uppercase tracking-wide">
                    {section.section}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {section.fields.map((field) => (
                    <FieldRow
                      key={field.key}
                      field={field}
                      formParams={formParams}
                      updateParam={updateParam}
                      canEdit={canEdit}
                    />
                  ))}
                </CardContent>
              </Card>
            )
          })}

          {/* Colorway section */}
          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-neutral-400 text-xs font-medium uppercase tracking-wide">
                Colorway
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <ColorSwatchPicker
                label="Body Color"
                value={formParams.body_color_hex || '#F5F0E8'}
                onChange={(hex) => updateParam('body_color_hex', hex)}
                disabled={!canEdit}
              />
              <ColorSwatchPicker
                label="Neckband Color"
                value={formParams.neckband_color_hex || '#1A1A1A'}
                onChange={(hex) => updateParam('neckband_color_hex', hex)}
                disabled={!canEdit}
              />
              {pocketEnabled && (
                <ColorSwatchPicker
                  label="Pocket Color"
                  value={formParams.pocket_color_hex || formParams.body_color_hex || '#F5F0E8'}
                  onChange={(hex) => updateParam('pocket_color_hex', hex)}
                  disabled={!canEdit}
                />
              )}
            </CardContent>
          </Card>

          {/* Derived parameters (read-only) */}
          <DerivedParamsSection params={formParams} />

          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="bg-red-950/50 border border-red-800 rounded-md p-3 space-y-1">
              {errors.map((err, i) => (
                <p key={i} className="text-red-400 text-xs">
                  {err}
                </p>
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

          {/* Version History */}
          <VersionHistory skuId={skuId} />
        </div>

        {/* ── Right preview panel (60%) ── */}
        <div className="w-[60%] flex flex-col gap-4">
          <Card className="bg-neutral-900 border-neutral-800 flex-1">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-neutral-100 text-sm">Preview</CardTitle>
                {currentVersionId && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDownloadPack}
                      disabled={downloadingPack}
                      className="text-orange-400 hover:text-orange-300 h-7 text-xs"
                    >
                      {downloadingPack ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Package className="h-3.5 w-3.5 mr-1" />
                      )}
                      Download Manufacturing Pack
                    </Button>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handlePushToDocuments}
                        disabled={pushing}
                        className="text-neutral-400 hover:text-neutral-100 h-7 text-xs"
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
              <Tabs defaultValue="2d" className="h-full">
                <TabsList className="bg-neutral-800 mb-3">
                  <TabsTrigger value="2d" className="text-xs data-[state=active]:bg-neutral-700">
                    2D Patterns
                  </TabsTrigger>
                  <TabsTrigger value="3d" className="text-xs data-[state=active]:bg-neutral-700">
                    3D Preview
                  </TabsTrigger>
                  {techSketchSvg && (
                    <TabsTrigger value="sketch" className="text-xs data-[state=active]:bg-neutral-700">
                      Tech Sketch
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* 2D Patterns tab */}
                <TabsContent value="2d" className="mt-0">
                  {svgContent ? (
                    <div
                      className="bg-neutral-950 rounded-lg p-4 overflow-auto"
                      style={{ maxHeight: 'calc(100vh - 340px)' }}
                      dangerouslySetInnerHTML={{ __html: svgContent }}
                    />
                  ) : (
                    <EmptyPreviewPlaceholder
                      icon={<Ruler className="h-14 w-14 text-neutral-700" />}
                      message="Fill in parameters and click Generate to preview 2D pattern pieces."
                    />
                  )}
                </TabsContent>

                {/* 3D Preview tab */}
                <TabsContent value="3d" className="mt-0">
                  {svgContent ? (
                    <div className="bg-neutral-950 rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 340px)', minHeight: '400px' }}>
                      <TshirtPreview3D
                        params={formParams}
                        hasGenerated={!!svgContent}
                      />
                    </div>
                  ) : (
                    <EmptyPreviewPlaceholder
                      icon={<Box className="h-14 w-14 text-neutral-700" />}
                      message="Generate a pattern first to see the 3D preview."
                    />
                  )}
                </TabsContent>

                {/* Tech Sketch tab */}
                {techSketchSvg && (
                  <TabsContent value="sketch" className="mt-0">
                    <div
                      className="bg-white rounded-lg p-4 overflow-auto"
                      style={{ maxHeight: 'calc(100vh - 340px)' }}
                      dangerouslySetInnerHTML={{ __html: techSketchSvg }}
                    />
                  </TabsContent>
                )}
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ─── Shared field row ─────────────────────────────────────────────────────────
function FieldRow({
  field,
  formParams,
  updateParam,
  canEdit,
}: {
  field: { key: string; label: string; type: string; required: boolean; placeholder?: string; options?: string[] }
  formParams: TshirtParams
  updateParam: (key: string, value: string | number | boolean) => void
  canEdit: boolean
}) {
  const val = (formParams as unknown as Record<string, unknown>)[field.key]

  if (field.type === 'checkbox') {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={field.key}
          checked={!!val}
          onCheckedChange={(checked) => updateParam(field.key, !!checked)}
          disabled={!canEdit}
          className="border-neutral-600 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
        />
        <Label htmlFor={field.key} className="text-neutral-300 text-sm cursor-pointer">
          {field.label}
        </Label>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-neutral-400 text-xs">
        {field.label}
        {field.required && <span className="text-red-400 ml-0.5">*</span>}
      </Label>
      {field.type === 'number' ? (
        <Input
          type="number"
          value={(val as number) ?? ''}
          placeholder={field.placeholder}
          onChange={(e) => updateParam(field.key, parseFloat(e.target.value) || 0)}
          className="bg-neutral-800 border-neutral-700 text-neutral-200 h-9"
          disabled={!canEdit}
        />
      ) : field.type === 'text' ? (
        <Input
          type="text"
          value={(val as string) ?? ''}
          placeholder={field.placeholder}
          onChange={(e) => updateParam(field.key, e.target.value)}
          className="bg-neutral-800 border-neutral-700 text-neutral-200 h-9"
          disabled={!canEdit}
        />
      ) : (
        <Select
          value={(val as string) || ''}
          onValueChange={(v) => updateParam(field.key, v)}
          disabled={!canEdit}
        >
          <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-200 h-9">
            <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent className="bg-neutral-800 border-neutral-700">
            {field.options?.map((opt) => (
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
  )
}

// ─── Empty preview placeholder ────────────────────────────────────────────────
function EmptyPreviewPlaceholder({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div
      className="bg-neutral-950 rounded-lg flex items-center justify-center"
      style={{ minHeight: '400px' }}
    >
      <div className="text-center">
        <div className="flex justify-center mb-4">{icon}</div>
        <p className="text-neutral-500 text-sm max-w-xs">{message}</p>
      </div>
    </div>
  )
}

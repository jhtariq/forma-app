'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { canEditSpecBom, canRequestApproval } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { SPEC_FIELD_GROUPS, ALL_SPEC_FIELD_KEYS } from '@/lib/constants'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { RequestApprovalDialog } from '@/components/approvals/request-approval-dialog'
import {
  ChevronDown,
  ChevronRight,
  Save,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  Eye,
  Send,
} from 'lucide-react'
import type { Json } from '@/lib/types/database'

interface CustomField {
  key: string
  value: string
}

export function SpecTab({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [fields, setFields] = useState<Record<string, string>>({})
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [saving, setSaving] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(SPEC_FIELD_GROUPS.map((g) => g.label))
  )
  const [viewingRevision, setViewingRevision] = useState<string | null>(null)
  const [approvalRevisionId, setApprovalRevisionId] = useState<string | null>(null)

  // Fetch spec + revisions
  const { data: specData } = useQuery({
    queryKey: ['spec', projectId],
    queryFn: async () => {
      const { data: spec } = await supabase
        .from('specs')
        .select('id')
        .eq('project_id', projectId)
        .single()

      if (!spec) return null

      const { data: revisions } = await supabase
        .from('spec_revisions')
        .select('*, app_users!spec_revisions_created_by_fkey(name)')
        .eq('spec_id', spec.id)
        .order('version_int', { ascending: false })

      // Find latest approved revision
      const { data: approvedRequests } = await supabase
        .from('approval_requests')
        .select('spec_revision_id')
        .eq('project_id', projectId)
        .eq('entity_type', 'spec')
        .eq('status', 'approved')
        .order('requested_at', { ascending: false })
        .limit(1)

      const latestApprovedId = approvedRequests?.[0]?.spec_revision_id
      const latestApproved = revisions?.find((r: any) => r.id === latestApprovedId)
      const latestDraft = revisions?.[0]

      return {
        specId: spec.id,
        revisions: revisions ?? [],
        latestApproved,
        latestDraft,
      }
    },
    enabled: !!user,
  })

  // Load latest draft into form
  useEffect(() => {
    if (!specData?.latestDraft) return
    const json = specData.latestDraft.fields_json as Record<string, string>
    const defaultFields: Record<string, string> = {}
    const customs: CustomField[] = []

    for (const [key, val] of Object.entries(json)) {
      if ((ALL_SPEC_FIELD_KEYS as readonly string[]).includes(key)) {
        defaultFields[key] = String(val ?? '')
      } else {
        customs.push({ key, value: String(val ?? '') })
      }
    }

    setFields(defaultFields)
    setCustomFields(customs)
  }, [specData?.latestDraft])

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const handleFieldChange = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  const addCustomField = () => {
    setCustomFields((prev) => [...prev, { key: '', value: '' }])
  }

  const removeCustomField = (index: number) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== index))
  }

  const updateCustomField = (index: number, field: 'key' | 'value', val: string) => {
    setCustomFields((prev) =>
      prev.map((cf, i) => (i === index ? { ...cf, [field]: val } : cf))
    )
  }

  const handleSave = async () => {
    if (!user || !specData) return
    setSaving(true)

    try {
      const fieldsJson: Record<string, string> = { ...fields }
      customFields.forEach((cf) => {
        if (cf.key.trim()) {
          fieldsJson[cf.key.trim()] = cf.value
        }
      })

      const nextVersion = (specData.revisions[0]?.version_int ?? 0) + 1

      const { data: revision, error } = await supabase
        .from('spec_revisions')
        .insert({
          spec_id: specData.specId,
          version_int: nextVersion,
          fields_json: fieldsJson as unknown as Json,
          notes: `Version ${nextVersion}`,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) throw error

      await logAuditEvent(supabase, {
        project_id: projectId,
        actor_user_id: user.id,
        action: 'spec_revision_created',
        entity_type: 'spec_revision',
        entity_id: revision.id,
        metadata_json: { version: nextVersion } as unknown as Json,
      })

      queryClient.invalidateQueries({ queryKey: ['spec', projectId] })
      toast.success(`Spec v${nextVersion} saved`)
    } catch (err) {
      console.error(err)
      toast.error('Failed to save spec revision')
    } finally {
      setSaving(false)
    }
  }

  const viewRevision = (revisionId: string) => {
    setViewingRevision(revisionId)
  }

  const viewedRevision = specData?.revisions.find((r: any) => r.id === viewingRevision)

  return (
    <div className="space-y-4">
      {/* Status cards */}
      <div className="grid grid-cols-2 gap-4">
        {specData?.latestApproved && (
          <Card className="bg-green-950/30 border-green-800/50">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium text-green-400 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Latest Approved — v{specData.latestApproved.version_int}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-4">
              <p className="text-xs text-green-300/70">
                by {specData.latestApproved.app_users?.name} ·{' '}
                {format(new Date(specData.latestApproved.created_at), 'MMM d, yyyy')}
              </p>
            </CardContent>
          </Card>
        )}
        {specData?.latestDraft &&
          specData.latestDraft.id !== specData.latestApproved?.id && (
            <Card className="bg-amber-950/20 border-amber-800/50">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium text-amber-400 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Latest Draft — v{specData.latestDraft.version_int}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-4">
                <p className="text-xs text-amber-300/70">
                  by {specData.latestDraft.app_users?.name} ·{' '}
                  {format(new Date(specData.latestDraft.created_at), 'MMM d, yyyy')}
                </p>
              </CardContent>
            </Card>
          )}
      </div>

      {/* Editable form */}
      {user && canEditSpecBom(user.role) && (
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-neutral-100 text-lg">Spec Fields</CardTitle>
              <div className="flex gap-2">
                {specData?.latestDraft && user && canRequestApproval(user.role) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setApprovalRevisionId(specData.latestDraft!.id)}
                    className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                  >
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    Request Approval
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {saving ? 'Saving...' : 'Save as New Revision'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {SPEC_FIELD_GROUPS.map((group) => (
              <Collapsible
                key={group.label}
                open={expandedGroups.has(group.label)}
                onOpenChange={() => toggleGroup(group.label)}
              >
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 px-3 rounded bg-neutral-800/50 hover:bg-neutral-800 transition-colors">
                  {expandedGroups.has(group.label) ? (
                    <ChevronDown className="h-4 w-4 text-neutral-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-neutral-400" />
                  )}
                  <span className="text-sm font-medium text-neutral-300">
                    {group.label}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 pb-1 space-y-3 px-1">
                  {group.fields.map((field) => {
                    const isLongField = [
                      'construction_notes',
                      'measurements',
                      'packaging_requirements',
                      'labeling_requirements',
                      'qc_requirements',
                      'compliance_requirements',
                      'notes',
                    ].includes(field.key)

                    return (
                      <div key={field.key} className="grid grid-cols-3 gap-3 items-start">
                        <label className="text-sm text-neutral-400 pt-2 text-right">
                          {field.label}
                        </label>
                        <div className="col-span-2">
                          {isLongField ? (
                            <Textarea
                              value={fields[field.key] ?? ''}
                              onChange={(e) => handleFieldChange(field.key, e.target.value)}
                              className="bg-neutral-800 border-neutral-700 text-neutral-100 text-sm"
                              rows={3}
                            />
                          ) : (
                            <Input
                              value={fields[field.key] ?? ''}
                              onChange={(e) => handleFieldChange(field.key, e.target.value)}
                              className="bg-neutral-800 border-neutral-700 text-neutral-100 text-sm"
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </CollapsibleContent>
              </Collapsible>
            ))}

            {/* Custom fields */}
            <Collapsible
              open={expandedGroups.has('Custom Fields')}
              onOpenChange={() => toggleGroup('Custom Fields')}
            >
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 px-3 rounded bg-neutral-800/50 hover:bg-neutral-800 transition-colors">
                {expandedGroups.has('Custom Fields') ? (
                  <ChevronDown className="h-4 w-4 text-neutral-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-neutral-400" />
                )}
                <span className="text-sm font-medium text-neutral-300">
                  Custom Fields
                </span>
                <Badge variant="secondary" className="ml-2 bg-neutral-700 text-neutral-400 text-[10px]">
                  {customFields.length}
                </Badge>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 pb-1 space-y-2 px-1">
                {customFields.map((cf, i) => (
                  <div key={i} className="grid grid-cols-3 gap-3 items-center">
                    <Input
                      value={cf.key}
                      onChange={(e) => updateCustomField(i, 'key', e.target.value)}
                      placeholder="Field name"
                      className="bg-neutral-800 border-neutral-700 text-neutral-100 text-sm"
                    />
                    <Input
                      value={cf.value}
                      onChange={(e) => updateCustomField(i, 'value', e.target.value)}
                      placeholder="Value"
                      className="bg-neutral-800 border-neutral-700 text-neutral-100 text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCustomField(i)}
                      className="h-8 w-8 text-neutral-500 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addCustomField}
                  className="border-neutral-700 text-neutral-400 hover:bg-neutral-800"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Custom Field
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}

      {/* Revision history */}
      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-neutral-100 text-sm">Revision History</CardTitle>
        </CardHeader>
        <CardContent>
          {specData?.revisions.length === 0 && (
            <p className="text-neutral-500 text-sm">No revisions yet</p>
          )}
          <div className="space-y-1">
            {specData?.revisions.map((rev: any) => (
              <div
                key={rev.id}
                className="flex items-center justify-between py-2 px-3 rounded hover:bg-neutral-800/50"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className="border-neutral-700 text-neutral-400 text-xs"
                  >
                    v{rev.version_int}
                  </Badge>
                  <span className="text-sm text-neutral-300">
                    {rev.app_users?.name}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {format(new Date(rev.created_at), 'MMM d, yyyy HH:mm')}
                  </span>
                  {rev.id === specData.latestApproved?.id && (
                    <Badge className="bg-green-700 text-white text-[10px]">
                      Approved
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => viewRevision(rev.id)}
                  className="text-neutral-400 hover:text-neutral-100 h-7"
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  View
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* View revision dialog */}
      {viewedRevision && (
        <Dialog open={!!viewingRevision} onOpenChange={() => setViewingRevision(null)}>
          <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-2xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Spec Revision v{viewedRevision.version_int}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {Object.entries(viewedRevision.fields_json as Record<string, string>).map(
                ([key, val]) => (
                  <div key={key} className="grid grid-cols-3 gap-2">
                    <span className="text-sm text-neutral-400 text-right">{key}</span>
                    <span className="col-span-2 text-sm text-neutral-200">
                      {val || '—'}
                    </span>
                  </div>
                )
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Request approval dialog */}
      {approvalRevisionId && specData && (
        <RequestApprovalDialog
          projectId={projectId}
          entityType="spec"
          revisionId={approvalRevisionId}
          revisionVersion={
            specData.revisions.find((r: any) => r.id === approvalRevisionId)?.version_int ?? 0
          }
          open={!!approvalRevisionId}
          onOpenChange={() => setApprovalRevisionId(null)}
        />
      )}
    </div>
  )
}

// Inline Dialog import for view revision
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

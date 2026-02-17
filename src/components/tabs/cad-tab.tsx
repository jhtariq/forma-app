'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { canGenerateCad, canRequestApproval } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { STATUS_COLORS } from '@/lib/constants'
import { format } from 'date-fns'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RequestApprovalDialog } from '@/components/approvals/request-approval-dialog'
import { Ruler, Plus, ExternalLink, Shield } from 'lucide-react'
import type { Json } from '@/lib/types/database'

interface SkuRow {
  id: string
  name: string
  garment_type: string
  status: string
  latest_cad_version_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  app_users: { name: string } | null
  latest_version?: { version_int: number } | null
}

export function CadTab({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [skuName, setSkuName] = useState('')
  const [creating, setCreating] = useState(false)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [approvalSku, setApprovalSku] = useState<SkuRow | null>(null)

  const { data: skus, isLoading } = useQuery({
    queryKey: ['skus', projectId],
    queryFn: async () => {
      const { data: skuData } = await supabase
        .from('skus')
        .select('*, app_users!skus_created_by_fkey(name)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (!skuData) return []

      // Get latest version info for each SKU
      const skusWithVersions: SkuRow[] = []
      for (const sku of skuData) {
        let latestVersion = null
        if (sku.latest_cad_version_id) {
          const { data: version } = await supabase
            .from('cad_versions')
            .select('version_int')
            .eq('id', sku.latest_cad_version_id)
            .single()
          latestVersion = version
        }
        skusWithVersions.push({
          ...sku,
          latest_version: latestVersion,
        } as SkuRow)
      }

      return skusWithVersions
    },
    enabled: !!user,
  })

  const handleCreateSku = async () => {
    if (!user || !skuName.trim()) return
    setCreating(true)

    try {
      const { data: project } = await supabase
        .from('projects')
        .select('org_id')
        .eq('id', projectId)
        .single()

      if (!project) throw new Error('Project not found')

      const { data: sku, error } = await supabase
        .from('skus')
        .insert({
          project_id: projectId,
          org_id: project.org_id,
          name: skuName.trim(),
          garment_type: 'tshirt',
          status: 'draft',
          created_by: user.id,
        })
        .select()
        .single()

      if (error) throw error

      await logAuditEvent(supabase, {
        project_id: projectId,
        actor_user_id: user.id,
        action: 'sku_created',
        entity_type: 'sku',
        entity_id: sku.id,
        metadata_json: { sku_name: skuName.trim(), garment_type: 'tshirt' } as unknown as Json,
      })

      queryClient.invalidateQueries({ queryKey: ['skus', projectId] })
      queryClient.invalidateQueries({ queryKey: ['audit', projectId] })
      toast.success(`SKU "${skuName.trim()}" created`)
      setSkuName('')
      setCreateOpen(false)
    } catch (err) {
      console.error(err)
      toast.error('Failed to create SKU')
    } finally {
      setCreating(false)
    }
  }

  const canEdit = user ? canGenerateCad(user.role) : false
  const canApprove = user ? canRequestApproval(user.role) : false

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ruler className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-semibold text-neutral-100">Pattern CAD</h2>
        </div>
        {canEdit && (
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Create SKU
          </Button>
        )}
      </div>

      {/* SKU List */}
      {isLoading ? (
        <div className="text-neutral-400 text-sm">Loading SKUs...</div>
      ) : !skus || skus.length === 0 ? (
        <Card className="bg-neutral-900 border-neutral-800">
          <CardContent className="py-12 text-center">
            <Ruler className="h-12 w-12 text-neutral-600 mx-auto mb-4" />
            <p className="text-neutral-400 text-sm">No SKUs created yet.</p>
            {canEdit && (
              <p className="text-neutral-500 text-xs mt-1">
                Create an SKU to start generating pattern pieces.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {skus.map((sku) => (
            <Card key={sku.id} className="bg-neutral-900 border-neutral-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-neutral-100 text-base">{sku.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge className={`${STATUS_COLORS[sku.status] || 'bg-gray-500'} text-white text-xs`}>
                      {sku.status}
                    </Badge>
                    <Badge variant="outline" className="text-neutral-400 border-neutral-700 text-xs">
                      {sku.garment_type}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm text-neutral-400">
                    <span>
                      Version: {sku.latest_version ? `v${sku.latest_version.version_int}` : 'None'}
                    </span>
                    <span>
                      Owner: {sku.app_users?.name || 'Unknown'}
                    </span>
                    <span>
                      Created: {format(new Date(sku.created_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {canApprove && sku.latest_cad_version_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-neutral-400 hover:text-neutral-100"
                        onClick={() => {
                          setApprovalSku(sku)
                          setApprovalOpen(true)
                        }}
                      >
                        <Shield className="h-4 w-4 mr-1" />
                        Request Approval
                      </Button>
                    )}
                    <Link href={`/projects/${projectId}/cad/${sku.id}/generate`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-orange-400 hover:text-orange-300"
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        {canEdit ? 'Generate' : 'View'}
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create SKU Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create SKU</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Create a new SKU to generate T-shirt pattern pieces.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-neutral-300">SKU Name</Label>
              <Input
                value={skuName}
                onChange={(e) => setSkuName(e.target.value)}
                placeholder="e.g. T-Shirt Size M"
                className="bg-neutral-800 border-neutral-700 text-neutral-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-neutral-300">Garment Type</Label>
              <Input
                value="T-Shirt"
                disabled
                className="bg-neutral-800 border-neutral-700 text-neutral-500"
              />
              <p className="text-xs text-neutral-500">Only T-Shirt is supported in Phase 1.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} className="text-neutral-400">
              Cancel
            </Button>
            <Button
              onClick={handleCreateSku}
              disabled={creating || !skuName.trim()}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {creating ? 'Creating...' : 'Create SKU'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Approval Dialog */}
      {approvalSku && approvalSku.latest_cad_version_id && (
        <RequestApprovalDialog
          projectId={projectId}
          entityType="cad"
          revisionId={approvalSku.latest_cad_version_id}
          revisionVersion={approvalSku.latest_version?.version_int || 1}
          open={approvalOpen}
          onOpenChange={setApprovalOpen}
        />
      )}
    </div>
  )
}

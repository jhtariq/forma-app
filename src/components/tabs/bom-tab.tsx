'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { canEditSpecBom, canRequestApproval } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { BOM_CSV_HEADERS } from '@/lib/constants'
import { format } from 'date-fns'
import { toast } from 'sonner'
import Papa from 'papaparse'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RequestApprovalDialog } from '@/components/approvals/request-approval-dialog'
import {
  Save,
  Plus,
  Trash2,
  Upload,
  Download,
  Eye,
  Send,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import type { Json } from '@/lib/types/database'

interface BomRow {
  line_no: number
  material: string
  supplier: string
  qty: number
  unit: string
  unit_cost: number
  currency: string
  lead_time_days: number | null
  notes: string
}

const emptyRow = (lineNo: number): BomRow => ({
  line_no: lineNo,
  material: '',
  supplier: '',
  qty: 0,
  unit: 'pcs',
  unit_cost: 0,
  currency: 'USD',
  lead_time_days: null,
  notes: '',
})

export function BomTab({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<BomRow[]>([emptyRow(1)])
  const [saving, setSaving] = useState(false)
  const [viewingRevision, setViewingRevision] = useState<string | null>(null)
  const [viewRows, setViewRows] = useState<BomRow[]>([])
  const [approvalRevisionId, setApprovalRevisionId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: bomData } = useQuery({
    queryKey: ['bom', projectId],
    queryFn: async () => {
      const { data: bom } = await supabase
        .from('boms')
        .select('id')
        .eq('project_id', projectId)
        .single()

      if (!bom) return null

      const { data: revisions } = await supabase
        .from('bom_revisions')
        .select('*, app_users!bom_revisions_created_by_fkey(name)')
        .eq('bom_id', bom.id)
        .order('version_int', { ascending: false })

      const { data: approvedRequests } = await supabase
        .from('approval_requests')
        .select('bom_revision_id')
        .eq('project_id', projectId)
        .eq('entity_type', 'bom')
        .eq('status', 'approved')
        .order('requested_at', { ascending: false })
        .limit(1)

      const latestApprovedId = approvedRequests?.[0]?.bom_revision_id
      const latestApproved = revisions?.find((r: any) => r.id === latestApprovedId)
      const latestDraft = revisions?.[0]

      return {
        bomId: bom.id,
        revisions: revisions ?? [],
        latestApproved,
        latestDraft,
      }
    },
    enabled: !!user,
  })

  // Load latest draft rows
  useEffect(() => {
    if (!bomData?.latestDraft) return

    const loadRows = async () => {
      const { data: bomRows } = await supabase
        .from('bom_rows')
        .select('*')
        .eq('bom_revision_id', bomData.latestDraft!.id)
        .order('line_no', { ascending: true })

      if (bomRows && bomRows.length > 0) {
        setRows(
          bomRows.map((r: any) => ({
            line_no: r.line_no,
            material: r.material,
            supplier: r.supplier,
            qty: Number(r.qty),
            unit: r.unit,
            unit_cost: Number(r.unit_cost),
            currency: r.currency ?? 'USD',
            lead_time_days: r.lead_time_days,
            notes: r.notes ?? '',
          }))
        )
      }
    }

    loadRows()
  }, [bomData?.latestDraft, supabase])

  const updateRow = (index: number, field: keyof BomRow, value: string | number) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    )
  }

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(prev.length + 1)])
  }

  const removeRow = (index: number) => {
    setRows((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((r, i) => ({ ...r, line_no: i + 1 }))
    )
  }

  const handleSave = async () => {
    if (!user || !bomData) return
    setSaving(true)

    try {
      const nextVersion = (bomData.revisions[0]?.version_int ?? 0) + 1

      const { data: revision, error: revError } = await supabase
        .from('bom_revisions')
        .insert({
          bom_id: bomData.bomId,
          version_int: nextVersion,
          notes: `Version ${nextVersion}`,
          created_by: user.id,
        })
        .select()
        .single()

      if (revError) throw revError

      // Insert rows
      const rowsToInsert = rows
        .filter((r) => r.material.trim())
        .map((r) => ({
          bom_revision_id: revision.id,
          line_no: r.line_no,
          material: r.material,
          supplier: r.supplier,
          qty: r.qty,
          unit: r.unit,
          unit_cost: r.unit_cost,
          currency: r.currency || null,
          lead_time_days: r.lead_time_days,
          notes: r.notes || null,
        }))

      if (rowsToInsert.length > 0) {
        const { error: rowsError } = await supabase
          .from('bom_rows')
          .insert(rowsToInsert)

        if (rowsError) throw rowsError
      }

      await logAuditEvent(supabase, {
        project_id: projectId,
        actor_user_id: user.id,
        action: 'bom_revision_created',
        entity_type: 'bom_revision',
        entity_id: revision.id,
        metadata_json: {
          version: nextVersion,
          row_count: rowsToInsert.length,
        } as unknown as Json,
      })

      queryClient.invalidateQueries({ queryKey: ['bom', projectId] })
      toast.success(`BOM v${nextVersion} saved`)
    } catch (err) {
      console.error(err)
      toast.error('Failed to save BOM revision')
    } finally {
      setSaving(false)
    }
  }

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed: BomRow[] = results.data.map((row: any, i: number) => ({
          line_no: parseInt(row.line_no) || i + 1,
          material: row.material ?? '',
          supplier: row.supplier ?? '',
          qty: parseFloat(row.qty) || 0,
          unit: row.unit ?? 'pcs',
          unit_cost: parseFloat(row.unit_cost) || 0,
          currency: row.currency ?? 'USD',
          lead_time_days: row.lead_time_days ? parseInt(row.lead_time_days) : null,
          notes: row.notes ?? '',
        }))

        setRows(parsed)
        toast.success(`Imported ${parsed.length} rows from CSV`)
      },
      error: () => {
        toast.error('Failed to parse CSV file')
      },
    })

    e.target.value = ''
  }

  const downloadTemplate = () => {
    const csv = BOM_CSV_HEADERS.join(',') + '\n1,Cotton Fabric,TextileCo,100,m,2.50,USD,14,Sample note\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bom_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const viewRevision = async (revisionId: string) => {
    const { data: bomRows } = await supabase
      .from('bom_rows')
      .select('*')
      .eq('bom_revision_id', revisionId)
      .order('line_no', { ascending: true })

    setViewRows(
      (bomRows ?? []).map((r: any) => ({
        line_no: r.line_no,
        material: r.material,
        supplier: r.supplier,
        qty: Number(r.qty),
        unit: r.unit,
        unit_cost: Number(r.unit_cost),
        currency: r.currency ?? '',
        lead_time_days: r.lead_time_days,
        notes: r.notes ?? '',
      }))
    )
    setViewingRevision(revisionId)
  }

  return (
    <div className="space-y-4">
      {/* Status cards */}
      <div className="grid grid-cols-2 gap-4">
        {bomData?.latestApproved && (
          <Card className="bg-green-950/30 border-green-800/50">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium text-green-400 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Latest Approved — v{bomData.latestApproved.version_int}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-4">
              <p className="text-xs text-green-300/70">
                by {bomData.latestApproved.app_users?.name} ·{' '}
                {format(new Date(bomData.latestApproved.created_at), 'MMM d, yyyy')}
              </p>
            </CardContent>
          </Card>
        )}
        {bomData?.latestDraft && bomData.latestDraft.id !== bomData.latestApproved?.id && (
          <Card className="bg-amber-950/20 border-amber-800/50">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium text-amber-400 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Latest Draft — v{bomData.latestDraft.version_int}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-4">
              <p className="text-xs text-amber-300/70">
                by {bomData.latestDraft.app_users?.name} ·{' '}
                {format(new Date(bomData.latestDraft.created_at), 'MMM d, yyyy')}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Editable BOM table */}
      {user && canEditSpecBom(user.role) && (
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-neutral-100 text-lg">BOM Table</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadTemplate}
                  className="border-neutral-700 text-neutral-400 hover:bg-neutral-800"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Template
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="border-neutral-700 text-neutral-400 hover:bg-neutral-800"
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Import CSV
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCsvImport}
                  className="hidden"
                />
                {bomData?.latestDraft && canRequestApproval(user.role) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setApprovalRevisionId(bomData.latestDraft!.id)}
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
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-neutral-800">
                    <TableHead className="text-neutral-400 w-12">#</TableHead>
                    <TableHead className="text-neutral-400">Material</TableHead>
                    <TableHead className="text-neutral-400">Supplier</TableHead>
                    <TableHead className="text-neutral-400 w-20">Qty</TableHead>
                    <TableHead className="text-neutral-400 w-20">Unit</TableHead>
                    <TableHead className="text-neutral-400 w-24">Unit Cost</TableHead>
                    <TableHead className="text-neutral-400 w-20">Currency</TableHead>
                    <TableHead className="text-neutral-400 w-24">Lead Time</TableHead>
                    <TableHead className="text-neutral-400">Notes</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i} className="border-neutral-800">
                      <TableCell className="text-neutral-500 text-sm">{row.line_no}</TableCell>
                      <TableCell>
                        <Input
                          value={row.material}
                          onChange={(e) => updateRow(i, 'material', e.target.value)}
                          className="bg-neutral-800 border-neutral-700 text-neutral-100 text-sm h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.supplier}
                          onChange={(e) => updateRow(i, 'supplier', e.target.value)}
                          className="bg-neutral-800 border-neutral-700 text-neutral-100 text-sm h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={row.qty}
                          onChange={(e) => updateRow(i, 'qty', parseFloat(e.target.value) || 0)}
                          className="bg-neutral-800 border-neutral-700 text-neutral-100 text-sm h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.unit}
                          onChange={(e) => updateRow(i, 'unit', e.target.value)}
                          className="bg-neutral-800 border-neutral-700 text-neutral-100 text-sm h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={row.unit_cost}
                          onChange={(e) =>
                            updateRow(i, 'unit_cost', parseFloat(e.target.value) || 0)
                          }
                          className="bg-neutral-800 border-neutral-700 text-neutral-100 text-sm h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.currency}
                          onChange={(e) => updateRow(i, 'currency', e.target.value)}
                          className="bg-neutral-800 border-neutral-700 text-neutral-100 text-sm h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={row.lead_time_days ?? ''}
                          onChange={(e) =>
                            updateRow(
                              i,
                              'lead_time_days',
                              e.target.value ? parseInt(e.target.value) : 0
                            )
                          }
                          placeholder="days"
                          className="bg-neutral-800 border-neutral-700 text-neutral-100 text-sm h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.notes}
                          onChange={(e) => updateRow(i, 'notes', e.target.value)}
                          className="bg-neutral-800 border-neutral-700 text-neutral-100 text-sm h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRow(i)}
                          className="h-7 w-7 text-neutral-500 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={addRow}
              className="mt-3 border-neutral-700 text-neutral-400 hover:bg-neutral-800"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Row
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Revision history */}
      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-neutral-100 text-sm">Revision History</CardTitle>
        </CardHeader>
        <CardContent>
          {bomData?.revisions.length === 0 && (
            <p className="text-neutral-500 text-sm">No revisions yet</p>
          )}
          <div className="space-y-1">
            {bomData?.revisions.map((rev: any) => (
              <div
                key={rev.id}
                className="flex items-center justify-between py-2 px-3 rounded hover:bg-neutral-800/50"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="border-neutral-700 text-neutral-400 text-xs">
                    v{rev.version_int}
                  </Badge>
                  <span className="text-sm text-neutral-300">{rev.app_users?.name}</span>
                  <span className="text-xs text-neutral-500">
                    {format(new Date(rev.created_at), 'MMM d, yyyy HH:mm')}
                  </span>
                  {rev.id === bomData.latestApproved?.id && (
                    <Badge className="bg-green-700 text-white text-[10px]">Approved</Badge>
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
      <Dialog open={!!viewingRevision} onOpenChange={() => setViewingRevision(null)}>
        <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              BOM Revision v
              {bomData?.revisions.find((r: any) => r.id === viewingRevision)?.version_int}
            </DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow className="border-neutral-800">
                <TableHead className="text-neutral-400">#</TableHead>
                <TableHead className="text-neutral-400">Material</TableHead>
                <TableHead className="text-neutral-400">Supplier</TableHead>
                <TableHead className="text-neutral-400">Qty</TableHead>
                <TableHead className="text-neutral-400">Unit</TableHead>
                <TableHead className="text-neutral-400">Unit Cost</TableHead>
                <TableHead className="text-neutral-400">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {viewRows.map((r) => (
                <TableRow key={r.line_no} className="border-neutral-800">
                  <TableCell className="text-neutral-400">{r.line_no}</TableCell>
                  <TableCell className="text-neutral-200">{r.material}</TableCell>
                  <TableCell className="text-neutral-200">{r.supplier}</TableCell>
                  <TableCell className="text-neutral-200">{r.qty}</TableCell>
                  <TableCell className="text-neutral-200">{r.unit}</TableCell>
                  <TableCell className="text-neutral-200">
                    {r.currency} {r.unit_cost}
                  </TableCell>
                  <TableCell className="text-neutral-400">{r.notes || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      {/* Request approval dialog */}
      {approvalRevisionId && bomData && (
        <RequestApprovalDialog
          projectId={projectId}
          entityType="bom"
          revisionId={approvalRevisionId}
          revisionVersion={
            bomData.revisions.find((r: any) => r.id === approvalRevisionId)?.version_int ?? 0
          }
          open={!!approvalRevisionId}
          onOpenChange={() => setApprovalRevisionId(null)}
        />
      )}
    </div>
  )
}

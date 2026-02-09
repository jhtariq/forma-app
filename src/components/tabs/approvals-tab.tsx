'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { canApproveReject } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { STATUS_COLORS } from '@/lib/constants'
import { CheckCircle2, XCircle, MessageSquare } from 'lucide-react'
import type { Json } from '@/lib/types/database'

interface ApprovalRequest {
  id: string
  entity_type: string
  spec_revision_id: string | null
  bom_revision_id: string | null
  status: string
  requested_by: string
  requested_at: string
  requester?: { name: string }
  assignees?: { user_id: string; user?: { name: string } }[]
  decisions?: {
    id: string
    decision: string
    comment: string | null
    decided_at: string
    user?: { name: string }
  }[]
  spec_revision?: { version_int: number }
  bom_revision?: { version_int: number }
}

export function ApprovalsTab({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const [decisionType, setDecisionType] = useState<'approve' | 'reject'>('approve')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { data: approvals } = useQuery({
    queryKey: ['approvals', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_requests')
        .select(`
          *,
          requester:app_users!approval_requests_requested_by_fkey(name),
          spec_revision:spec_revisions(version_int),
          bom_revision:bom_revisions(version_int)
        `)
        .eq('project_id', projectId)
        .order('requested_at', { ascending: false })

      if (error) throw error

      // Fetch assignees and decisions for each request
      const enriched = await Promise.all(
        (data ?? []).map(async (req: any) => {
          const { data: assignees } = await supabase
            .from('approval_assignees')
            .select('user_id, user:app_users(name)')
            .eq('approval_request_id', req.id)

          const { data: decisions } = await supabase
            .from('approval_decisions')
            .select('*, user:app_users(name)')
            .eq('approval_request_id', req.id)
            .order('decided_at', { ascending: false })

          return { ...req, assignees, decisions } as ApprovalRequest
        })
      )

      return enriched
    },
    enabled: !!user,
  })

  const isAssignedApprover = (approval: ApprovalRequest) => {
    return approval.assignees?.some((a) => a.user_id === user?.id) ?? false
  }

  const startDecision = (approvalId: string, type: 'approve' | 'reject') => {
    setDecidingId(approvalId)
    setDecisionType(type)
    setComment('')
  }

  const handleDecision = async () => {
    if (!user || !decidingId) return
    if (decisionType === 'reject' && !comment.trim()) {
      toast.error('Comment is required for rejection')
      return
    }

    setSubmitting(true)

    try {
      const { error: decisionError } = await supabase
        .from('approval_decisions')
        .insert({
          approval_request_id: decidingId,
          user_id: user.id,
          decision: decisionType,
          comment: comment.trim() || null,
        })

      if (decisionError) throw decisionError

      const newStatus = decisionType === 'approve' ? 'approved' : 'rejected'
      const { error: updateError } = await supabase
        .from('approval_requests')
        .update({ status: newStatus })
        .eq('id', decidingId)

      if (updateError) throw updateError

      await logAuditEvent(supabase, {
        project_id: projectId,
        actor_user_id: user.id,
        action: decisionType === 'approve' ? 'approval_approved' : 'approval_rejected',
        entity_type: 'approval_request',
        entity_id: decidingId,
        metadata_json: {
          decision: decisionType,
          comment: comment.trim() || null,
        } as unknown as Json,
      })

      // Check if both spec and bom are approved for auto-status
      if (decisionType === 'approve') {
        const { data: allApproved } = await supabase
          .from('approval_requests')
          .select('entity_type')
          .eq('project_id', projectId)
          .eq('status', 'approved')

        const hasSpec = allApproved?.some((a: any) => a.entity_type === 'spec')
        const hasBom = allApproved?.some((a: any) => a.entity_type === 'bom')

        if (hasSpec && hasBom) {
          await supabase
            .from('projects')
            .update({ status: 'Approved', updated_at: new Date().toISOString() })
            .eq('id', projectId)

          queryClient.invalidateQueries({ queryKey: ['project', projectId] })
        }
      }

      queryClient.invalidateQueries({ queryKey: ['approvals', projectId] })
      queryClient.invalidateQueries({ queryKey: ['spec', projectId] })
      queryClient.invalidateQueries({ queryKey: ['bom', projectId] })

      toast.success(
        decisionType === 'approve' ? 'Approved successfully' : 'Rejected'
      )
      setDecidingId(null)
    } catch (err) {
      console.error(err)
      toast.error('Failed to submit decision')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      {approvals?.length === 0 && (
        <div className="text-center py-12 text-neutral-500 text-sm">
          No approval requests yet. Request approval from the Spec or BOM tab.
        </div>
      )}

      {approvals?.map((approval) => {
        const version =
          approval.entity_type === 'spec'
            ? approval.spec_revision?.version_int
            : approval.bom_revision?.version_int

        return (
          <Card key={approval.id} className="bg-neutral-900 border-neutral-800">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="border-neutral-700 text-neutral-300 text-xs"
                    >
                      {approval.entity_type.toUpperCase()}
                    </Badge>
                    <span className="text-sm text-neutral-200">
                      v{version}
                    </span>
                    <Badge
                      className={`${STATUS_COLORS[approval.status] ?? 'bg-neutral-600'} text-white text-xs`}
                    >
                      {approval.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-neutral-500">
                    Requested by {approval.requester?.name} ·{' '}
                    {format(new Date(approval.requested_at), 'MMM d, yyyy HH:mm')}
                  </p>
                  {approval.assignees && approval.assignees.length > 0 && (
                    <p className="text-xs text-neutral-500">
                      Assigned to: {approval.assignees.map((a: any) => a.user?.name).join(', ')}
                    </p>
                  )}

                  {/* Decisions */}
                  {approval.decisions?.map((d: any) => (
                    <div
                      key={d.id}
                      className={`mt-2 p-2 rounded text-sm ${
                        d.decision === 'approve'
                          ? 'bg-green-950/30 border border-green-800/50'
                          : 'bg-red-950/30 border border-red-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {d.decision === 'approve' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-400" />
                        )}
                        <span
                          className={
                            d.decision === 'approve' ? 'text-green-300' : 'text-red-300'
                          }
                        >
                          {d.decision === 'approve' ? 'Approved' : 'Rejected'} by{' '}
                          {d.user?.name}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {format(new Date(d.decided_at), 'MMM d, yyyy HH:mm')}
                        </span>
                      </div>
                      {d.comment && (
                        <div className="mt-1 flex items-start gap-1.5 text-xs text-neutral-400">
                          <MessageSquare className="h-3 w-3 mt-0.5" />
                          {d.comment}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                {approval.status === 'pending' &&
                  user &&
                  canApproveReject(user.role, isAssignedApprover(approval)) && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startDecision(approval.id, 'approve')}
                        className="border-green-700 text-green-400 hover:bg-green-950/30"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startDecision(approval.id, 'reject')}
                        className="border-red-700 text-red-400 hover:bg-red-950/30"
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
              </div>
            </CardContent>
          </Card>
        )
      })}

      {/* Decision dialog */}
      <Dialog open={!!decidingId} onOpenChange={() => setDecidingId(null)}>
        <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decisionType === 'approve' ? 'Approve' : 'Reject'} Request
            </DialogTitle>
            <DialogDescription className="text-neutral-400">
              {decisionType === 'reject'
                ? 'A comment is required when rejecting.'
                : 'Add an optional comment with your approval.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                decisionType === 'reject'
                  ? 'Reason for rejection (required)...'
                  : 'Optional comment...'
              }
              className="bg-neutral-800 border-neutral-700 text-neutral-100"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDecidingId(null)}
              className="text-neutral-400"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDecision}
              disabled={submitting || (decisionType === 'reject' && !comment.trim())}
              className={
                decisionType === 'approve'
                  ? 'bg-green-700 hover:bg-green-800 text-white'
                  : 'bg-red-700 hover:bg-red-800 text-white'
              }
            >
              {submitting
                ? 'Submitting...'
                : decisionType === 'approve'
                  ? 'Confirm Approval'
                  : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

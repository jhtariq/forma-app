'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import type { EntityType } from '@/lib/types/database'

interface RequestApprovalDialogProps {
  projectId: string
  entityType: EntityType
  revisionId: string
  revisionVersion: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RequestApprovalDialog({
  projectId,
  entityType,
  revisionId,
  revisionVersion,
  open,
  onOpenChange,
}: RequestApprovalDialogProps) {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [selectedApprover, setSelectedApprover] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { data: orgUsers } = useQuery({
    queryKey: ['org-users'],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_users')
        .select('id, name, email, role')
        .neq('role', 'viewer')

      return (data ?? []) as Array<{ id: string; name: string; email: string; role: string }>
    },
    enabled: !!user && open,
  })

  const approverOptions = orgUsers?.filter((u) => u.id !== user?.id) ?? []

  const handleSubmit = async () => {
    if (!user || !selectedApprover) return
    setSubmitting(true)

    try {
      const response = await fetch(`/api/projects/${projectId}/approvals/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType,
          revisionId,
          approverId: selectedApprover,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to request approval' }))
        throw new Error(err.error ?? 'Failed to request approval')
      }

      queryClient.invalidateQueries({ queryKey: ['approvals', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })

      toast.success(`Approval requested for ${entityType.toUpperCase()} v${revisionVersion}`)
      onOpenChange(false)
      setSelectedApprover('')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to request approval')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Approval</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Request approval for {entityType.toUpperCase()} v{revisionVersion}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-neutral-300">Assign Approver</Label>
            <Select value={selectedApprover} onValueChange={setSelectedApprover}>
              <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-200">
                <SelectValue placeholder="Select an approver..." />
              </SelectTrigger>
              <SelectContent className="bg-neutral-800 border-neutral-700">
                {approverOptions.map((u) => (
                  <SelectItem
                    key={u.id}
                    value={u.id}
                    className="text-neutral-200 focus:bg-neutral-700 focus:text-neutral-100"
                  >
                    {u.name} ({u.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-neutral-400"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !selectedApprover}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

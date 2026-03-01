'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { UserPlus, X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

interface Member {
  id: string
  user_id: string
  created_at: string
  app_users: {
    id: string
    name: string
    email: string
    role: string
  } | null
}

interface ExternalUser {
  id: string
  name: string
  email: string
}

export function ProjectMembersPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const supabase = createClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const isAdmin = user?.role === 'admin'

  // Fetch current project members
  const { data: membersData } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/members`)
      if (!res.ok) throw new Error('Failed to fetch members')
      const json = await res.json()
      return json.members as Member[]
    },
    enabled: !!user,
  })

  const members = membersData ?? []

  // Fetch all external users in the org (for the add dialog)
  const { data: externalUsers } = useQuery({
    queryKey: ['external-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_users')
        .select('id, name, email')
        .eq('role', 'external')
        .order('name')
      if (error) throw error
      return data as ExternalUser[]
    },
    enabled: !!user && dialogOpen,
  })

  // External users not yet assigned to this project
  const assignedIds = new Set(members.map((m) => m.user_id))
  const availableUsers = (externalUsers ?? []).filter((u) => !assignedIds.has(u.id))

  const handleAdd = async (userId: string) => {
    setAdding(userId)
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to add member' }))
        throw new Error(err.error ?? 'Failed to add member')
      }
      await queryClient.invalidateQueries({ queryKey: ['project-members', projectId] })
      toast.success('Vendor added to project')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setAdding(null)
    }
  }

  const handleRemove = async (userId: string, name: string) => {
    setRemoving(userId)
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${userId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to remove member' }))
        throw new Error(err.error ?? 'Failed to remove member')
      }
      await queryClient.invalidateQueries({ queryKey: ['project-members', projectId] })
      toast.success(`${name} removed from project`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove member')
    } finally {
      setRemoving(null)
    }
  }

  // Only show panel to admins, or to anyone if there are already members
  if (!isAdmin && members.length === 0) return null

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="flex items-center gap-1.5 text-xs text-neutral-500">
          <UserPlus className="h-3.5 w-3.5" />
          Vendor Access
        </span>

        {members.length === 0 && (
          <span className="text-xs text-neutral-600">No vendors assigned</span>
        )}

        {members.map((m) => {
          const name = m.app_users?.name ?? 'Unknown'
          const userId = m.user_id
          return (
            <span
              key={m.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-xs text-neutral-300"
            >
              {name}
              {isAdmin && (
                <button
                  onClick={() => handleRemove(userId, name)}
                  disabled={removing === userId}
                  className="ml-0.5 text-neutral-500 hover:text-red-400 transition-colors disabled:opacity-40"
                  aria-label={`Remove ${name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          )
        })}

        {isAdmin && (
          <button
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-neutral-700 text-xs text-neutral-500 hover:border-orange-600/50 hover:text-orange-400 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add vendor
          </button>
        )}
      </div>

      {/* Add vendor dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Vendor to Project</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Select a vendor to grant them access to this project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1 max-h-64 overflow-y-auto">
            {availableUsers.length === 0 && (
              <p className="text-sm text-neutral-500 py-4 text-center">
                {(externalUsers ?? []).length === 0
                  ? 'No vendor accounts exist in this organisation.'
                  : 'All vendors are already assigned to this project.'}
              </p>
            )}
            {availableUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => handleAdd(u.id)}
                disabled={adding === u.id}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-neutral-800 transition-colors disabled:opacity-50 text-left"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-100">{u.name}</p>
                  <p className="text-xs text-neutral-500">{u.email}</p>
                </div>
                <Plus className="h-4 w-4 text-neutral-500 shrink-0" />
              </button>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              className="text-neutral-400 hover:text-neutral-100"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { canManuallySetStatus } from '@/lib/permissions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { STATUS_COLORS, PROJECT_STATUSES } from '@/lib/constants'
import { ArrowLeft, Calendar, Building2, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { ProjectStatus } from '@/lib/types/database'

interface ProjectHeaderProps {
  project: {
    id: string
    name: string
    customer: string
    status: string
    due_date: string | null
    facilities?: { name: string } | null
    app_users?: { name: string } | null
  }
}

export function ProjectHeader({ project }: ProjectHeaderProps) {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const handleStatusChange = async (newStatus: string) => {
    const { error } = await supabase
      .from('projects')
      .update({ status: newStatus as ProjectStatus, updated_at: new Date().toISOString() })
      .eq('id', project.id)

    if (error) {
      toast.error('Failed to update status')
      return
    }

    queryClient.invalidateQueries({ queryKey: ['project', project.id] })
    toast.success(`Status updated to ${newStatus}`)
  }

  return (
    <div className="space-y-3">
      <Link
        href="/projects"
        className="inline-flex items-center text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Projects
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100">{project.name}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-neutral-400">
            {project.customer && (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {project.customer}
              </span>
            )}
            {project.facilities && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {project.facilities.name}
              </span>
            )}
            {project.due_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Due {format(new Date(project.due_date), 'MMM d, yyyy')}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user && canManuallySetStatus(user.role) ? (
            <Select value={project.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[140px] bg-neutral-800 border-neutral-700 text-neutral-200 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-neutral-800 border-neutral-700">
                {PROJECT_STATUSES.map((s) => (
                  <SelectItem
                    key={s}
                    value={s}
                    className="text-neutral-200 focus:bg-neutral-700 focus:text-neutral-100"
                  >
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge
              className={`${STATUS_COLORS[project.status] ?? 'bg-neutral-600'} text-white`}
            >
              {project.status}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}

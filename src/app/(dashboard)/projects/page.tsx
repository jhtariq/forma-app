'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { canCreateProject } from '@/lib/permissions'
import { ProjectsTable } from '@/components/projects/projects-table'
import { CreateProjectDialog } from '@/components/projects/create-project-dialog'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useState } from 'react'

export default function ProjectsPage() {
  const { user } = useAuth()
  const supabase = createClient()
  const [createOpen, setCreateOpen] = useState(false)

  const { data: projects, isLoading, isPending } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, app_users!projects_created_by_fkey(name)')
        .order('updated_at', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100">Projects</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Manage your manufacturing projects and orders
          </p>
        </div>
        {user && canCreateProject(user.role) && (
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Create Project
          </Button>
        )}
      </div>

      {!user || isLoading || isPending ? (
        <div className="text-neutral-400 text-sm py-12 text-center">
          Loading projects...
        </div>
      ) : (
        <ProjectsTable projects={projects ?? []} />
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

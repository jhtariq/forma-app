'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { ProjectHeader } from '@/components/projects/project-header'
import { ProjectTabs } from '@/components/projects/project-tabs'

interface ProjectDetail {
  id: string
  name: string
  customer: string
  status: string
  due_date: string | null
  created_at: string
  updated_at: string
  facilities: { name: string } | null
  app_users: { name: string } | null
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { user } = useAuth()
  const supabase = createClient()

  const { data: project, isLoading, isPending } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          facilities(name),
          app_users!projects_created_by_fkey(name)
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      return data as unknown as ProjectDetail
    },
    enabled: !!user,
  })

  if (!user || isLoading || isPending) {
    return (
      <div className="text-neutral-400 text-sm py-12 text-center">
        Loading project...
      </div>
    )
  }

  if (!project) {
    return (
      <div className="text-neutral-400 text-sm py-12 text-center">
        Project not found
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ProjectHeader project={project} />
      <ProjectTabs projectId={project.id} />
    </div>
  )
}

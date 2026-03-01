'use client'

import { useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { canCreateProject } from '@/lib/permissions'
import { ProjectsTable } from '@/components/projects/projects-table'
import { CompanyFolderGrid, type CompanyGroup } from '@/components/projects/company-folder-grid'
import { CreateProjectDialog } from '@/components/projects/create-project-dialog'
import { Button } from '@/components/ui/button'

interface Project {
  id: string
  name: string
  customer: string
  status: string
  due_date: string | null
  updated_at: string
  app_users?: { name: string } | null
}

export default function ProjectsPage() {
  const { user } = useAuth()
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)

  // Decode the ?customer= param — null means we're at the top-level folder view
  const selectedCustomer = searchParams.get('customer')

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, app_users!projects_created_by_fkey(name)')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as Project[]
    },
    enabled: !!user,
  })

  // Group all projects by customer for the folder view
  const companyGroups = useMemo((): CompanyGroup[] => {
    if (!projects) return []

    const grouped = new Map<string, Project[]>()
    for (const p of projects) {
      const key = p.customer || 'Uncategorized'
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(p)
    }

    return Array.from(grouped.entries())
      .map(([customer, projs]) => ({
        customer,
        projects: projs,
        projectCount: projs.length,
        latestProjectName: projs[0]?.name ?? '',
        statusSummary: projs.reduce((acc: Record<string, number>, p: Project) => {
          acc[p.status] = (acc[p.status] ?? 0) + 1
          return acc
        }, {}),
      }))
      // Sort by most recently updated project within each company
      .sort((a, b) => {
        const aDate = a.projects[0]?.updated_at ?? ''
        const bDate = b.projects[0]?.updated_at ?? ''
        return bDate.localeCompare(aDate)
      })
  }, [projects])

  // Filter projects for the selected company
  const companyProjects = useMemo(() => {
    if (!projects || !selectedCustomer) return []
    return projects.filter(
      (p: Project) => (p.customer || 'Uncategorized') === selectedCustomer
    )
  }, [projects, selectedCustomer])

  const isLoadingState = !user || isLoading

  // ── Company-level view (/projects?customer=X) ──────────────────────────────
  if (selectedCustomer) {
    return (
      <div className="space-y-6">
        {/* Breadcrumb */}
        <button
          onClick={() => router.push('/projects')}
          className="flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-100 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          All Companies
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-100">{selectedCustomer}</h1>
            <p className="text-sm text-neutral-400 mt-1">
              {isLoadingState ? '…' : `${companyProjects.length} ${companyProjects.length === 1 ? 'project' : 'projects'}`}
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

        {isLoadingState ? (
          <div className="text-neutral-400 text-sm py-12 text-center">Loading projects...</div>
        ) : (
          <ProjectsTable projects={companyProjects} />
        )}

        <CreateProjectDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          defaultCustomer={selectedCustomer}
        />
      </div>
    )
  }

  // ── Top-level folder view (/projects) ─────────────────────────────────────
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

      {isLoadingState ? (
        <div className="text-neutral-400 text-sm py-12 text-center">Loading projects...</div>
      ) : (
        <CompanyFolderGrid companies={companyGroups} />
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

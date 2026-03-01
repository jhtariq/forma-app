'use client'

import Link from 'next/link'
import { Folder } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { STATUS_COLORS } from '@/lib/constants'

interface Project {
  id: string
  name: string
  customer: string
  status: string
  due_date: string | null
  updated_at: string
}

export interface CompanyGroup {
  customer: string
  projectCount: number
  projects: Project[]
  latestProjectName: string
  statusSummary: Record<string, number>
}

export function CompanyFolderGrid({ companies }: { companies: CompanyGroup[] }) {
  if (companies.length === 0) {
    return (
      <div className="text-center py-16 text-neutral-400">
        <p className="text-lg">No projects yet</p>
        <p className="text-sm mt-1">Create your first project to get started</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {companies.map((company) => (
        <CompanyCard key={company.customer} company={company} />
      ))}
    </div>
  )
}

function CompanyCard({ company }: { company: CompanyGroup }) {
  const href = `/projects?customer=${encodeURIComponent(company.customer)}`

  // Only show statuses that have at least one project
  const statusEntries = Object.entries(company.statusSummary).filter(([, count]) => count > 0)

  return (
    <Link href={href} className="group block">
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-5 h-full transition-colors hover:border-orange-600/50 hover:bg-neutral-900">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <Folder className="h-6 w-6 text-orange-500 shrink-0 mt-0.5 transition-colors group-hover:text-orange-400" />
          <h2 className="text-neutral-100 font-semibold text-base leading-snug break-words">
            {company.customer}
          </h2>
        </div>

        {/* Project count */}
        <p className="text-sm text-neutral-400 mb-3">
          {company.projectCount} {company.projectCount === 1 ? 'project' : 'projects'}
        </p>

        {/* Status summary */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {statusEntries.map(([status, count]) => (
            <Badge
              key={status}
              variant="secondary"
              className={`${STATUS_COLORS[status] ?? 'bg-neutral-600'} text-white text-xs`}
            >
              {status} ×{count}
            </Badge>
          ))}
        </div>

        {/* Latest project */}
        <p className="text-xs text-neutral-500 truncate">
          Latest: {company.latestProjectName}
        </p>
      </div>
    </Link>
  )
}

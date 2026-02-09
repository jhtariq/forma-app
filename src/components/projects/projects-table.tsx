'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { STATUS_COLORS } from '@/lib/constants'

interface Project {
  id: string
  name: string
  customer: string
  status: string
  due_date: string | null
  updated_at: string
  app_users?: { name: string } | null
}

export function ProjectsTable({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return (
      <div className="text-center py-16 text-neutral-400">
        <p className="text-lg">No projects yet</p>
        <p className="text-sm mt-1">Create your first project to get started</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-neutral-800 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-neutral-800 hover:bg-transparent">
            <TableHead className="text-neutral-400 font-medium">Project Name</TableHead>
            <TableHead className="text-neutral-400 font-medium">Customer</TableHead>
            <TableHead className="text-neutral-400 font-medium">Status</TableHead>
            <TableHead className="text-neutral-400 font-medium">Due Date</TableHead>
            <TableHead className="text-neutral-400 font-medium">Last Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow
              key={project.id}
              className="border-neutral-800 hover:bg-neutral-900/50 cursor-pointer"
            >
              <TableCell>
                <Link
                  href={`/projects/${project.id}`}
                  className="text-neutral-100 font-medium hover:text-orange-400 transition-colors"
                >
                  {project.name}
                </Link>
              </TableCell>
              <TableCell className="text-neutral-300">
                {project.customer || '—'}
              </TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  className={`${STATUS_COLORS[project.status] ?? 'bg-neutral-600'} text-white text-xs`}
                >
                  {project.status}
                </Badge>
              </TableCell>
              <TableCell className="text-neutral-400 text-sm">
                {project.due_date
                  ? format(new Date(project.due_date), 'MMM d, yyyy')
                  : '—'}
              </TableCell>
              <TableCell className="text-neutral-400 text-sm">
                {format(new Date(project.updated_at), 'MMM d, yyyy')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

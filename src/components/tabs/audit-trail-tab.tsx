'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { format } from 'date-fns'
import {
  Upload,
  FileEdit,
  Table2,
  Send,
  CheckCircle2,
  XCircle,
  Download,
  Ruler,
  FolderInput,
} from 'lucide-react'
import type { AuditAction } from '@/lib/types/database'

const ACTION_CONFIG: Record<
  AuditAction,
  { icon: React.ReactNode; label: string; color: string }
> = {
  document_uploaded: {
    icon: <Upload className="h-4 w-4" />,
    label: 'Document uploaded',
    color: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  },
  spec_revision_created: {
    icon: <FileEdit className="h-4 w-4" />,
    label: 'Spec revision created',
    color: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
  },
  bom_revision_created: {
    icon: <Table2 className="h-4 w-4" />,
    label: 'BOM revision created',
    color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',
  },
  approval_requested: {
    icon: <Send className="h-4 w-4" />,
    label: 'Approval requested',
    color: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  },
  approval_approved: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    label: 'Approved',
    color: 'text-green-400 bg-green-400/10 border-green-400/30',
  },
  approval_rejected: {
    icon: <XCircle className="h-4 w-4" />,
    label: 'Rejected',
    color: 'text-red-400 bg-red-400/10 border-red-400/30',
  },
  export_generated: {
    icon: <Download className="h-4 w-4" />,
    label: 'Export generated',
    color: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  },
  sku_created: {
    icon: <Ruler className="h-4 w-4" />,
    label: 'SKU created',
    color: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/30',
  },
  cad_version_generated: {
    icon: <Ruler className="h-4 w-4" />,
    label: 'CAD version generated',
    color: 'text-teal-400 bg-teal-400/10 border-teal-400/30',
  },
  cad_pushed_to_documents: {
    icon: <FolderInput className="h-4 w-4" />,
    label: 'CAD pushed to documents',
    color: 'text-sky-400 bg-sky-400/10 border-sky-400/30',
  },
}

export function AuditTrailTab({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const supabase = createClient()

  const { data: events } = useQuery({
    queryKey: ['audit', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_events')
        .select('*, actor:app_users!audit_events_actor_user_id_fkey(name)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  if (!events || events.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500 text-sm">
        No audit events yet. Events are recorded automatically when actions occur.
      </div>
    )
  }

  return (
    <div className="relative pl-8">
      {/* Timeline line */}
      <div className="absolute left-[15px] top-0 bottom-0 w-px bg-neutral-800" />

      <div className="space-y-0">
        {events.map((event: any, i: any) => {
          const config = ACTION_CONFIG[event.action as AuditAction] ?? {
            icon: <FileEdit className="h-4 w-4" />,
            label: event.action,
            color: 'text-neutral-400 bg-neutral-400/10 border-neutral-400/30',
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const metadata = event.metadata_json as Record<string, any> | null

          return (
            <div key={event.id} className="relative pb-6">
              {/* Timeline dot */}
              <div
                className={`absolute -left-8 top-1 w-[30px] h-[30px] rounded-full border flex items-center justify-center ${config.color}`}
              >
                {config.icon}
              </div>

              {/* Content */}
              <div className="ml-2 pt-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-200">
                    {config.label}
                  </span>
                  {metadata?.version && (
                    <span className="text-xs text-neutral-500">
                      v{String(metadata.version)}
                    </span>
                  )}
                  {metadata?.filename && (
                    <span className="text-xs text-neutral-500">
                      {String(metadata.filename)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-neutral-500">
                    {event.actor?.name}
                  </span>
                  <span className="text-xs text-neutral-600">·</span>
                  <span className="text-xs text-neutral-500">
                    {format(new Date(event.created_at), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
                {event.diff_summary && (
                  <p className="text-xs text-neutral-500 mt-1">
                    {event.diff_summary}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

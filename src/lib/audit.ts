import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuditAction, Json } from '@/lib/types/database'

export async function logAuditEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: {
    project_id: string
    actor_user_id: string
    action: AuditAction
    entity_type: string
    entity_id: string
    diff_summary?: string
    metadata_json?: Json
  }
) {
  const { error } = await supabase.from('audit_events').insert({
    project_id: params.project_id,
    actor_user_id: params.actor_user_id,
    action: params.action,
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    diff_summary: params.diff_summary ?? null,
    metadata_json: params.metadata_json ?? {},
  })

  if (error) {
    console.error('Failed to log audit event:', error)
  }
}

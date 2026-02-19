export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'admin' | 'member' | 'external' | 'viewer'
export type ProjectStatus = 'Draft' | 'In Review' | 'Approved' | 'Exported'
export type EntityType = 'spec' | 'bom' | 'cad'
export type SkuStatus = 'draft' | 'revision' | 'approved' | 'production_ready'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type ApprovalDecisionType = 'approve' | 'reject'
export type AuditAction =
  | 'document_uploaded'
  | 'spec_revision_created'
  | 'bom_revision_created'
  | 'approval_requested'
  | 'approval_approved'
  | 'approval_rejected'
  | 'export_generated'
  | 'sku_created'
  | 'cad_version_generated'
  | 'cad_pushed_to_documents'
  | 'manufacturing_pack_downloaded'

export type DocumentTag = 'Spec' | 'BOM' | 'QC' | 'Compliance' | 'Shipping' | 'Other'

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
        }
      }
      facilities: {
        Row: {
          id: string
          org_id: string
          name: string
          address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          address?: string | null
          created_at?: string
        }
      }
      app_users: {
        Row: {
          id: string
          org_id: string
          email: string
          name: string
          role: UserRole
          created_at: string
        }
        Insert: {
          id: string
          org_id: string
          email: string
          name: string
          role: UserRole
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          email?: string
          name?: string
          role?: UserRole
          created_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          org_id: string
          facility_id: string
          name: string
          customer: string
          due_date: string | null
          status: ProjectStatus
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          facility_id: string
          name: string
          customer: string
          due_date?: string | null
          status?: ProjectStatus
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          facility_id?: string
          name?: string
          customer?: string
          due_date?: string | null
          status?: ProjectStatus
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      project_members: {
        Row: {
          id: string
          project_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          user_id?: string
          created_at?: string
        }
      }
      documents: {
        Row: {
          id: string
          project_id: string
          filename: string
          mime_type: string
          storage_bucket: string
          storage_path: string
          tags: string[]
          notes: string | null
          uploaded_by: string
          uploaded_at: string
        }
        Insert: {
          id?: string
          project_id: string
          filename: string
          mime_type: string
          storage_bucket?: string
          storage_path: string
          tags?: string[]
          notes?: string | null
          uploaded_by: string
          uploaded_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          filename?: string
          mime_type?: string
          storage_bucket?: string
          storage_path?: string
          tags?: string[]
          notes?: string | null
          uploaded_by?: string
          uploaded_at?: string
        }
      }
      specs: {
        Row: {
          id: string
          project_id: string
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          created_at?: string
        }
      }
      spec_revisions: {
        Row: {
          id: string
          spec_id: string
          version_int: number
          fields_json: Json
          notes: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          spec_id: string
          version_int: number
          fields_json: Json
          notes?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          spec_id?: string
          version_int?: number
          fields_json?: Json
          notes?: string | null
          created_by?: string
          created_at?: string
        }
      }
      boms: {
        Row: {
          id: string
          project_id: string
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          created_at?: string
        }
      }
      bom_revisions: {
        Row: {
          id: string
          bom_id: string
          version_int: number
          notes: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          bom_id: string
          version_int: number
          notes?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          bom_id?: string
          version_int?: number
          notes?: string | null
          created_by?: string
          created_at?: string
        }
      }
      bom_rows: {
        Row: {
          id: string
          bom_revision_id: string
          line_no: number
          material: string
          supplier: string
          qty: number
          unit: string
          unit_cost: number
          currency: string | null
          lead_time_days: number | null
          notes: string | null
        }
        Insert: {
          id?: string
          bom_revision_id: string
          line_no: number
          material: string
          supplier: string
          qty: number
          unit: string
          unit_cost: number
          currency?: string | null
          lead_time_days?: number | null
          notes?: string | null
        }
        Update: {
          id?: string
          bom_revision_id?: string
          line_no?: number
          material?: string
          supplier?: string
          qty?: number
          unit?: string
          unit_cost?: number
          currency?: string | null
          lead_time_days?: number | null
          notes?: string | null
        }
      }
      skus: {
        Row: {
          id: string
          project_id: string
          org_id: string
          name: string
          garment_type: string
          status: SkuStatus
          created_by: string
          latest_cad_version_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          org_id: string
          name: string
          garment_type?: string
          status?: SkuStatus
          created_by: string
          latest_cad_version_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          org_id?: string
          name?: string
          garment_type?: string
          status?: SkuStatus
          created_by?: string
          latest_cad_version_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      cad_versions: {
        Row: {
          id: string
          sku_id: string
          version_int: number
          parameter_snapshot: Json
          svg_content: string
          dxf_storage_path: string
          svg_storage_path: string
          diff_summary: string | null
          notes: string | null
          created_by: string
          created_at: string
          pattern_ir: Json | null
          manufacturing_pack_path: string | null
          tech_sketch_storage_path: string | null
        }
        Insert: {
          id?: string
          sku_id: string
          version_int: number
          parameter_snapshot: Json
          svg_content: string
          dxf_storage_path: string
          svg_storage_path: string
          diff_summary?: string | null
          notes?: string | null
          created_by: string
          created_at?: string
          pattern_ir?: Json | null
          manufacturing_pack_path?: string | null
          tech_sketch_storage_path?: string | null
        }
        Update: {
          id?: string
          sku_id?: string
          version_int?: number
          parameter_snapshot?: Json
          svg_content?: string
          dxf_storage_path?: string
          svg_storage_path?: string
          diff_summary?: string | null
          notes?: string | null
          created_by?: string
          created_at?: string
          pattern_ir?: Json | null
          manufacturing_pack_path?: string | null
          tech_sketch_storage_path?: string | null
        }
      }
      approval_requests: {
        Row: {
          id: string
          project_id: string
          entity_type: EntityType
          spec_revision_id: string | null
          bom_revision_id: string | null
          cad_version_id: string | null
          status: ApprovalStatus
          requested_by: string
          requested_at: string
        }
        Insert: {
          id?: string
          project_id: string
          entity_type: EntityType
          spec_revision_id?: string | null
          bom_revision_id?: string | null
          cad_version_id?: string | null
          status?: ApprovalStatus
          requested_by: string
          requested_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          entity_type?: EntityType
          spec_revision_id?: string | null
          bom_revision_id?: string | null
          cad_version_id?: string | null
          status?: ApprovalStatus
          requested_by?: string
          requested_at?: string
        }
      }
      approval_assignees: {
        Row: {
          id: string
          approval_request_id: string
          user_id: string
        }
        Insert: {
          id?: string
          approval_request_id: string
          user_id: string
        }
        Update: {
          id?: string
          approval_request_id?: string
          user_id?: string
        }
      }
      approval_decisions: {
        Row: {
          id: string
          approval_request_id: string
          user_id: string
          decision: ApprovalDecisionType
          comment: string | null
          decided_at: string
        }
        Insert: {
          id?: string
          approval_request_id: string
          user_id: string
          decision: ApprovalDecisionType
          comment?: string | null
          decided_at?: string
        }
        Update: {
          id?: string
          approval_request_id?: string
          user_id?: string
          decision?: ApprovalDecisionType
          comment?: string | null
          decided_at?: string
        }
      }
      export_packs: {
        Row: {
          id: string
          project_id: string
          spec_revision_id: string | null
          bom_revision_id: string | null
          included_document_ids: string[]
          storage_bucket: string
          storage_path: string
          generated_by: string
          generated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          spec_revision_id?: string | null
          bom_revision_id?: string | null
          included_document_ids?: string[]
          storage_bucket?: string
          storage_path: string
          generated_by: string
          generated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          spec_revision_id?: string | null
          bom_revision_id?: string | null
          included_document_ids?: string[]
          storage_bucket?: string
          storage_path?: string
          generated_by?: string
          generated_at?: string
        }
      }
      audit_events: {
        Row: {
          id: string
          project_id: string
          actor_user_id: string
          action: AuditAction
          entity_type: string
          entity_id: string
          diff_summary: string | null
          metadata_json: Json
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          actor_user_id: string
          action: AuditAction
          entity_type: string
          entity_id: string
          diff_summary?: string | null
          metadata_json?: Json
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          actor_user_id?: string
          action?: AuditAction
          entity_type?: string
          entity_id?: string
          diff_summary?: string | null
          metadata_json?: Json
          created_at?: string
        }
      }
    }
  }
}

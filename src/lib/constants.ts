import type { DocumentTag } from '@/lib/types/database'

export const SPEC_FIELD_GROUPS = [
  {
    label: 'Product Info',
    fields: [
      { key: 'product_name', label: 'Product Name' },
      { key: 'style_or_sku', label: 'Style / SKU' },
      { key: 'season_or_collection', label: 'Season / Collection' },
      { key: 'factory_name', label: 'Factory Name' },
      { key: 'country_of_origin', label: 'Country of Origin' },
    ],
  },
  {
    label: 'Materials & Construction',
    fields: [
      { key: 'fabric_composition', label: 'Fabric Composition' },
      { key: 'colorways', label: 'Colorways' },
      { key: 'sizes', label: 'Sizes' },
      { key: 'measurements', label: 'Measurements' },
      { key: 'construction_notes', label: 'Construction Notes' },
    ],
  },
  {
    label: 'Requirements',
    fields: [
      { key: 'packaging_requirements', label: 'Packaging Requirements' },
      { key: 'labeling_requirements', label: 'Labeling Requirements' },
      { key: 'qc_requirements', label: 'QC Requirements' },
      { key: 'compliance_requirements', label: 'Compliance Requirements' },
    ],
  },
  {
    label: 'Costs & Timing',
    fields: [
      { key: 'target_cost', label: 'Target Cost' },
      { key: 'lead_time_target', label: 'Lead Time Target' },
      { key: 'notes', label: 'Notes' },
    ],
  },
] as const

export const ALL_SPEC_FIELD_KEYS = SPEC_FIELD_GROUPS.flatMap((g) =>
  g.fields.map((f) => f.key)
)

export const DOCUMENT_TAGS: DocumentTag[] = [
  'Spec',
  'BOM',
  'QC',
  'Compliance',
  'Shipping',
  'Other',
]

export const BOM_CSV_HEADERS = [
  'line_no',
  'material',
  'supplier',
  'qty',
  'unit',
  'unit_cost',
  'currency',
  'lead_time_days',
  'notes',
] as const

export const PROJECT_STATUSES = [
  'Draft',
  'In Review',
  'Approved',
  'Exported',
] as const

export const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-500',
  'In Review': 'bg-amber-500',
  Approved: 'bg-green-600',
  Exported: 'bg-blue-600',
  pending: 'bg-amber-500',
  approved: 'bg-green-600',
  rejected: 'bg-red-500',
  cancelled: 'bg-gray-400',
}

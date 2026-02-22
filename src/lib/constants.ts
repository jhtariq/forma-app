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
  draft: 'bg-gray-500',
  revision: 'bg-amber-500',
  production_ready: 'bg-indigo-600',
}

export const SKU_STATUSES = ['draft', 'revision', 'approved', 'production_ready'] as const

// Legacy — kept so old code referencing CAD_PARAM_FIELDS doesn't break at compile time,
// but the generate page now uses CAD_PARAM_SECTIONS below.
export const CAD_PARAM_FIELDS = [] as const

export type CadFieldType = 'number' | 'select' | 'text' | 'checkbox'

export interface CadParamField {
  key: string
  label: string
  type: CadFieldType
  required: boolean
  placeholder?: string
  options?: string[]
  conditional?: string
  // For advanced fields: human-readable description of the auto formula
  advancedHint?: string
}

export interface CadParamSection {
  section: string
  collapsible?: boolean
  // Marks this as the advanced-overrides section (collapsed by default, shows reset button)
  advanced?: boolean
  fields: CadParamField[]
}

// ─── Primary sections (11 required fields the user always fills in) ───────────
// ─── Advanced section (10 fields with sensible derived defaults) ──────────────
export const CAD_PARAM_SECTIONS: CadParamSection[] = [
  {
    section: 'Identity',
    fields: [
      { key: 'size_label', label: 'Size Label', type: 'text', required: true, placeholder: 'M' },
      {
        key: 'fit_profile',
        label: 'Fit Profile',
        type: 'select',
        required: true,
        options: ['slim', 'regular', 'relaxed', 'oversized'],
      },
    ],
  },
  {
    section: 'Body',
    fields: [
      { key: 'chest_finished_circumference_mm', label: 'Chest Circumference (mm)', type: 'number', required: true },
      { key: 'body_length_hps_to_hem_mm', label: 'Body Length HPS→Hem (mm)', type: 'number', required: true },
      { key: 'shoulder_width_mm', label: 'Shoulder Width (mm)', type: 'number', required: true },
    ],
  },
  {
    section: 'Sleeve',
    fields: [
      {
        key: 'sleeve_type',
        label: 'Sleeve Type',
        type: 'select',
        required: true,
        options: ['short', 'long'],
      },
      { key: 'sleeve_length_mm', label: 'Sleeve Length (mm)', type: 'number', required: true },
    ],
  },
  {
    section: 'Neckline',
    fields: [
      {
        key: 'neckline_type',
        label: 'Neckline Type',
        type: 'select',
        required: true,
        options: ['crew', 'v'],
      },
      { key: 'neck_depth_front_mm', label: 'Neck Depth Front (mm)', type: 'number', required: true },
      {
        key: 'fabric_stretch_class',
        label: 'Fabric Stretch',
        type: 'select',
        required: true,
        options: ['low', 'medium', 'high'],
      },
    ],
  },
  {
    section: 'Pocket',
    collapsible: true,
    fields: [
      { key: 'pocket_enabled', label: 'Enable Pocket', type: 'checkbox', required: false },
      {
        key: 'pocket_width_mm',
        label: 'Pocket Width (mm)',
        type: 'number',
        required: false,
        conditional: 'pocket_enabled',
      },
      {
        key: 'pocket_height_mm',
        label: 'Pocket Height (mm)',
        type: 'number',
        required: false,
        conditional: 'pocket_enabled',
      },
      {
        key: 'pocket_placement_from_cf_mm',
        label: 'Placement from CF (mm)',
        type: 'number',
        required: false,
        conditional: 'pocket_enabled',
      },
      {
        key: 'pocket_placement_from_shoulder_mm',
        label: 'Placement from Shoulder (mm)',
        type: 'number',
        required: false,
        conditional: 'pocket_enabled',
      },
      {
        key: 'pocket_corner_radius_mm',
        label: 'Corner Radius (mm)',
        type: 'number',
        required: false,
        conditional: 'pocket_enabled',
      },
    ],
  },
  {
    section: 'Advanced Overrides',
    collapsible: true,
    advanced: true,
    fields: [
      {
        key: 'hem_sweep_width_mm',
        label: 'Hem Sweep Width (mm)',
        type: 'number',
        required: false,
        advancedHint: 'chest circumference',
      },
      {
        key: 'bicep_width_mm',
        label: 'Bicep Width (mm)',
        type: 'number',
        required: false,
        advancedHint: 'chest × 0.35',
      },
      {
        key: 'sleeve_opening_width_mm',
        label: 'Sleeve Opening Width (mm)',
        type: 'number',
        required: false,
        advancedHint: 'bicep × 0.89',
      },
      {
        key: 'drop_shoulder_mm',
        label: 'Drop Shoulder (mm)',
        type: 'number',
        required: false,
        advancedHint: '0 (standard set-in)',
      },
      {
        key: 'neck_width_mm',
        label: 'Neck Width (mm)',
        type: 'number',
        required: false,
        advancedHint: 'shoulder × 0.41',
      },
      {
        key: 'neck_depth_back_mm',
        label: 'Neck Depth Back (mm)',
        type: 'number',
        required: false,
        advancedHint: 'front depth × 0.31',
      },
      {
        key: 'neckband_finished_width_mm',
        label: 'Neckband Width (mm)',
        type: 'number',
        required: false,
        advancedHint: '20 mm standard',
      },
      {
        key: 'seam_allowance_mm',
        label: 'Seam Allowance (mm)',
        type: 'number',
        required: false,
        advancedHint: '10 mm standard',
      },
      {
        key: 'hem_allowance_body_mm',
        label: 'Hem Allowance Body (mm)',
        type: 'number',
        required: false,
        advancedHint: '20 mm standard',
      },
      {
        key: 'hem_allowance_sleeve_mm',
        label: 'Hem Allowance Sleeve (mm)',
        type: 'number',
        required: false,
        advancedHint: '20 mm standard',
      },
    ],
  },
]

export const COLOR_SWATCHES: { name: string; hex: string }[] = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Off White', hex: '#F5F0E8' },
  { name: 'Black', hex: '#1A1A1A' },
  { name: 'Charcoal', hex: '#3D3D3D' },
  { name: 'Navy', hex: '#1B2A4A' },
  { name: 'Royal Blue', hex: '#1E4DB7' },
  { name: 'Sky Blue', hex: '#5BA4CF' },
  { name: 'Red', hex: '#C41E3A' },
  { name: 'Forest Green', hex: '#2D5016' },
  { name: 'Sage', hex: '#8A9A5B' },
  { name: 'Heather Gray', hex: '#9E9E9E' },
  { name: 'Sand', hex: '#D4B896' },
]

export const CAD_DEFAULT_PARAMS = {
  size_label: 'M',
  fit_profile: 'regular' as const,
  chest_finished_circumference_mm: 1040,
  body_length_hps_to_hem_mm: 700,
  shoulder_width_mm: 460,
  hem_sweep_width_mm: 1040,
  sleeve_type: 'short' as const,
  sleeve_length_mm: 220,
  bicep_width_mm: 360,
  sleeve_opening_width_mm: 320,
  drop_shoulder_mm: 0,
  neckline_type: 'crew' as const,
  neck_width_mm: 190,
  neck_depth_front_mm: 80,
  neck_depth_back_mm: 25,
  neckband_finished_width_mm: 20,
  fabric_stretch_class: 'medium' as const,
  seam_allowance_mm: 10,
  hem_allowance_body_mm: 20,
  hem_allowance_sleeve_mm: 20,
  pocket_enabled: false,
  body_color_hex: '#F5F0E8',
  neckband_color_hex: '#1A1A1A',
}

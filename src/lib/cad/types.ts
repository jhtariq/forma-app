// ─── Primitive geometry (kept for backward-compat with existing renderers) ────

export interface Point {
  x: number
  y: number
}

export interface Line {
  type: 'line'
  start: Point
  end: Point
}

export interface Arc {
  type: 'arc'
  center: Point
  radius: number
  startAngle: number
  endAngle: number
}

export interface Circle {
  type: 'circle'
  center: Point
  radius: number
}

export interface Polyline {
  type: 'polyline'
  points: Point[]
  closed: boolean
}

export interface TextLabel {
  type: 'text'
  position: Point
  content: string
  height: number
  rotation?: number
}

export interface Notch {
  type: 'notch'
  position: Point
  angle: number
  length: number
}

export interface Grainline {
  type: 'grainline'
  start: Point
  end: Point
}

export type GeometryEntity = Line | Arc | Circle | Polyline | TextLabel | Notch | Grainline

export interface PatternPiece {
  name: string
  entities: GeometryEntity[]
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number }
}

// ─── v2 TshirtParams (replaces the old 9-field set) ──────────────────────────

export interface TshirtParams {
  // Identity / metadata
  size_label: string
  fit_profile: 'slim' | 'regular' | 'relaxed' | 'oversized'

  // Body measurements (mm)
  chest_finished_circumference_mm: number
  body_length_hps_to_hem_mm: number
  shoulder_width_mm: number
  hem_sweep_width_mm: number

  // Sleeve
  sleeve_type: 'short' | 'long'
  sleeve_length_mm: number
  bicep_width_mm: number
  sleeve_opening_width_mm: number
  drop_shoulder_mm: number

  // Neckline
  neckline_type: 'crew' | 'v'
  neck_width_mm: number
  neck_depth_front_mm: number
  neck_depth_back_mm: number
  neckband_finished_width_mm: number
  fabric_stretch_class: 'low' | 'medium' | 'high'

  // Allowances
  seam_allowance_mm: number
  hem_allowance_body_mm: number
  hem_allowance_sleeve_mm: number

  // Pocket (optional)
  pocket_enabled: boolean
  pocket_width_mm?: number
  pocket_height_mm?: number
  pocket_placement_from_cf_mm?: number
  pocket_placement_from_shoulder_mm?: number
  pocket_corner_radius_mm?: number

  // Colorway (predefined swatches stored as hex)
  body_color_hex: string
  neckband_color_hex: string
  pocket_color_hex?: string
}

// ─── Derived (internal, computed from TshirtParams) ──────────────────────────

export interface DerivedParams {
  armhole_depth_mm: number
  armhole_curve_template_scale: number
  sleeve_cap_height_mm: number
  sleeve_cap_ease_mm: number
  neckband_length_ratio: number
  sleeve_cap_adjusted: boolean
  sleeve_cap_adjustment_mm: number
}

// ─── PatternIR — canonical intermediate representation (schema_version: 2) ───

export type EdgeType = 'cut' | 'sew' | 'hem' | 'fold' | 'placement' | 'internal'
export type AllowanceType =
  | 'seam_allowance'
  | 'hem_allowance_body'
  | 'hem_allowance_sleeve'
  | 'none'

export interface IREdge {
  seam_id: string
  edge_type: EdgeType
  allowance_type: AllowanceType
  points: Point[]
}

export interface IRNotch {
  notch_id: string
  seam_id: string
  position: Point
  angle_deg: number
  length_mm: number
}

export interface IRPiece {
  name: string
  cut_quantity: number
  mirror: boolean
  fold: boolean
  units: 'mm'
  cut_contour: Point[]
  sew_edges: IREdge[]
  notches: IRNotch[]
  grainline: { start: Point; end: Point }
  labels: {
    size_label: string
    piece_name: string
    cut_instruction: string
    version: number
  }
  bounding_box: { minX: number; minY: number; maxX: number; maxY: number }
}

export interface PatternIR {
  template_type: 'tshirt'
  schema_version: 2
  params: TshirtParams
  derived: DerivedParams
  pieces: IRPiece[]
}

// ─── Generation result ────────────────────────────────────────────────────────

export interface GenerationResult {
  ir: PatternIR
  pieces: PatternPiece[]
}

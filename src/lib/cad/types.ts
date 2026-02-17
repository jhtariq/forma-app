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

export interface TshirtParams {
  chest_circumference_mm: number
  shoulder_width_mm: number
  body_length_mm: number
  sleeve_length_mm: number
  neck_width_mm: number
  ease_mm: number
  seam_allowance_mm: number
  sleeve_type?: 'short' | 'long'
  neckline_type?: 'crew' | 'v'
}

export interface GenerationResult {
  pieces: PatternPiece[]
  svgContent: string
  dxfContent: string
}

export { generateTshirtPattern } from './tshirt-generator'
export { renderSvg } from './svg-renderer'
export { renderDxf } from './dxf-writer'
export { validateTshirtParams } from './validate'
export { computeParamDiff } from './diff'
export type {
  TshirtParams,
  PatternPiece,
  GenerationResult,
  Point,
  GeometryEntity,
  Line,
  Arc,
  Circle,
  Polyline,
  TextLabel,
  Notch,
  Grainline,
} from './types'
export type { ValidationResult } from './validate'

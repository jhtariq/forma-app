// ─── Core generator ───────────────────────────────────────────────────────────
export { generateTshirtPattern, computeDerivedParams } from './tshirt-generator'

// ─── Renderers ────────────────────────────────────────────────────────────────
export { renderSvg, renderSvgFromPieces } from './svg-renderer'
export { renderDxf, renderDxfFromPieces } from './dxf-writer'
export { renderTechSketch } from './tech-sketch-renderer'

// ─── Output generators ────────────────────────────────────────────────────────
export { generateSpecSheet } from './spec-sheet-generator'
export { generateConstructionNotes } from './construction-notes-generator'
export { generateBom } from './bom-generator'
export { assembleManufacturingPack } from './zip-assembler'

// ─── Validation & diff ────────────────────────────────────────────────────────
export { validateTshirtParams } from './validate'
export { computeParamDiff, computeParamDiffStructured, buildVersionDiffJson } from './diff'

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  // Geometry primitives
  Point,
  Line,
  Arc,
  Circle,
  Polyline,
  TextLabel,
  Notch,
  Grainline,
  GeometryEntity,
  PatternPiece,
  // v2 params + IR
  TshirtParams,
  DerivedParams,
  EdgeType,
  AllowanceType,
  IREdge,
  IRNotch,
  IRPiece,
  PatternIR,
  GenerationResult,
} from './types'
export type { ValidationResult } from './validate'
export type { ParamDiff } from './diff'

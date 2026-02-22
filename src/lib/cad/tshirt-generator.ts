import type {
  TshirtParams,
  DerivedParams,
  PatternIR,
  IRPiece,
  IREdge,
  IRNotch,
  PatternPiece,
  Point,
  GeometryEntity,
  GenerationResult,
} from './types'

// ─── Fixed-precision helper ───────────────────────────────────────────────────
function fp(n: number): number {
  return parseFloat(n.toFixed(2))
}

// ─── Polyline length ──────────────────────────────────────────────────────────
function polylineLength(pts: Point[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x
    const dy = pts[i].y - pts[i - 1].y
    len += Math.sqrt(dx * dx + dy * dy)
  }
  return len
}

// ─── Bounding box from a set of points ───────────────────────────────────────
function bbox(pts: Point[]): IRPiece['bounding_box'] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX: fp(minX), minY: fp(minY), maxX: fp(maxX), maxY: fp(maxY) }
}

// ─── Legacy PatternPiece builder from IRPiece ─────────────────────────────────
function irPieceToPatternPiece(piece: IRPiece): PatternPiece {
  const entities: GeometryEntity[] = []

  // Cut contour as closed polyline
  entities.push({ type: 'polyline', points: piece.cut_contour, closed: true })

  // Sew edges as separate polylines
  for (const edge of piece.sew_edges) {
    if (edge.edge_type === 'fold') {
      entities.push({ type: 'line', start: edge.points[0], end: edge.points[edge.points.length - 1] })
    } else if (edge.points.length === 2) {
      entities.push({ type: 'line', start: edge.points[0], end: edge.points[1] })
    } else if (edge.points.length > 2) {
      entities.push({ type: 'polyline', points: edge.points, closed: false })
    }
  }

  // Notches
  for (const n of piece.notches) {
    entities.push({ type: 'notch', position: n.position, angle: n.angle_deg, length: n.length_mm })
  }

  // Grainline
  entities.push({ type: 'grainline', start: piece.grainline.start, end: piece.grainline.end })

  // Label
  const bb = piece.bounding_box
  const cx = fp((bb.minX + bb.maxX) / 2)
  const cy = fp((bb.minY + bb.maxY) / 2)
  entities.push({
    type: 'text',
    position: { x: cx, y: cy },
    content: `${piece.labels.piece_name}\n${piece.labels.cut_instruction}\n${piece.labels.size_label} v${piece.labels.version}`,
    height: 10,
  })

  return {
    name: piece.name,
    entities,
    boundingBox: piece.bounding_box,
  }
}

// ─── Derived parameter computation ───────────────────────────────────────────
function computeDerived(params: TshirtParams): Omit<DerivedParams, 'sleeve_cap_adjusted' | 'sleeve_cap_adjustment_mm'> {
  const armhole_depth_mm = fp(params.shoulder_width_mm * 0.5 + params.drop_shoulder_mm)
  const armhole_curve_template_scale = fp(armhole_depth_mm / 220)
  const sleeve_cap_height_mm = fp(armhole_depth_mm * 0.6)
  const sleeve_cap_ease_mm = 0 // knit fabric

  const neckband_length_ratio =
    params.fabric_stretch_class === 'low' ? 0.92 :
    params.fabric_stretch_class === 'medium' ? 0.85 : 0.75

  return {
    armhole_depth_mm,
    armhole_curve_template_scale,
    sleeve_cap_height_mm,
    sleeve_cap_ease_mm,
    neckband_length_ratio,
  }
}

// Export for UI use (live derived param display)
export function computeDerivedParams(params: Partial<TshirtParams>): Partial<DerivedParams> {
  if (!params.shoulder_width_mm || !params.drop_shoulder_mm === undefined) return {}
  const armhole_depth_mm = fp(
    (params.shoulder_width_mm ?? 0) * 0.5 + (params.drop_shoulder_mm ?? 0)
  )
  const sleeve_cap_height_mm = fp(armhole_depth_mm * 0.6)
  const neckband_length_ratio =
    params.fabric_stretch_class === 'low' ? 0.92 :
    params.fabric_stretch_class === 'medium' ? 0.85 : 0.75

  return {
    armhole_depth_mm,
    armhole_curve_template_scale: fp(armhole_depth_mm / 220),
    sleeve_cap_height_mm,
    sleeve_cap_ease_mm: 0,
    neckband_length_ratio,
  }
}

// ─── Front bodice IRPiece ─────────────────────────────────────────────────────
function buildFrontBodice(params: TshirtParams, derived: DerivedParams, version: number): IRPiece {
  const sa = params.seam_allowance_mm
  const ham = params.hem_allowance_body_mm
  const halfChest = fp(params.chest_finished_circumference_mm / 4)
  const bodyLen = params.body_length_hps_to_hem_mm
  const halfShoulder = fp(params.shoulder_width_mm / 2)
  const halfNeck = fp(params.neck_width_mm / 2)
  const neckDepthFront = params.neck_depth_front_mm
  const ah = derived.armhole_depth_mm

  // Crew neckline: rounded arc via bezier approximation points
  const necklinePoints: Point[] =
    params.neckline_type === 'v'
      ? [
          { x: fp(0), y: fp(0) },
          { x: fp(halfNeck * 0.5), y: fp(neckDepthFront * 0.5) },
          { x: fp(halfNeck), y: fp(neckDepthFront) },
        ]
      : [
          { x: fp(0), y: fp(neckDepthFront * 0.1) },
          { x: fp(halfNeck * 0.3), y: fp(neckDepthFront * 0.85) },
          { x: fp(halfNeck * 0.7), y: fp(neckDepthFront * 0.97) },
          { x: fp(halfNeck), y: fp(neckDepthFront) },
        ]

  // Armhole curve points (from shoulder → underarm)
  const armholePoints: Point[] = [
    { x: fp(halfShoulder), y: fp(neckDepthFront) },
    { x: fp(halfChest * 0.92), y: fp(ah * 0.3) },
    { x: fp(halfChest), y: fp(ah) },
  ]

  // Sew edge: shoulder seam (S1)
  const shoulderEdge: IREdge = {
    seam_id: 'S1',
    edge_type: 'sew',
    allowance_type: 'seam_allowance',
    points: [
      { x: fp(halfNeck), y: fp(neckDepthFront) },
      { x: fp(halfShoulder), y: fp(neckDepthFront) },
    ],
  }

  // Sew edge: side seam (S2)
  const sideSeamEdge: IREdge = {
    seam_id: 'S2',
    edge_type: 'sew',
    allowance_type: 'seam_allowance',
    points: [
      { x: fp(halfChest), y: fp(ah) },
      { x: fp(halfChest), y: fp(bodyLen - ham) },
    ],
  }

  // Sew edge: armhole (S3)
  const armholeEdge: IREdge = {
    seam_id: 'S3',
    edge_type: 'sew',
    allowance_type: 'seam_allowance',
    points: armholePoints,
  }

  // Sew edge: neckline (S4)
  const necklineEdge: IREdge = {
    seam_id: 'S4',
    edge_type: 'sew',
    allowance_type: 'seam_allowance',
    points: necklinePoints,
  }

  // Hem edge: bottom (body hem)
  const hemEdge: IREdge = {
    seam_id: 'HEM_FRONT',
    edge_type: 'hem',
    allowance_type: 'hem_allowance_body',
    points: [
      { x: fp(halfChest), y: fp(bodyLen - ham) },
      { x: fp(0), y: fp(bodyLen - ham) },
    ],
  }

  // Cut contour (outer boundary, includes allowances)
  const cutContour: Point[] = [
    { x: fp(-sa), y: fp(-sa) },                             // CF top-left with allowance
    ...necklinePoints.map(p => ({ x: fp(p.x), y: fp(p.y - sa) })),
    { x: fp(halfNeck + sa), y: fp(neckDepthFront - sa) },
    { x: fp(halfShoulder + sa), y: fp(neckDepthFront - sa) },
    ...armholePoints.slice(1).map(p => ({ x: fp(p.x + sa), y: fp(p.y) })),
    { x: fp(halfChest + sa), y: fp(bodyLen + ham) },
    { x: fp(0), y: fp(bodyLen + ham) },
  ]

  // Notches
  const notches: IRNotch[] = [
    {
      notch_id: 'N1',
      seam_id: 'S3',
      position: { x: fp(halfChest * 0.96), y: fp(ah * 0.5) },
      angle_deg: 0,
      length_mm: 8,
    },
    {
      notch_id: 'N2',
      seam_id: 'S2',
      position: { x: fp(halfChest), y: fp(ah + (bodyLen - ham - ah) * 0.5) },
      angle_deg: 0,
      length_mm: 8,
    },
  ]

  // Pocket placement internal edges (if enabled)
  const pocketEdges: IREdge[] = []
  if (params.pocket_enabled && params.pocket_width_mm && params.pocket_height_mm) {
    const pcf = params.pocket_placement_from_cf_mm ?? 70
    const psh = params.pocket_placement_from_shoulder_mm ?? 130
    const pw = params.pocket_width_mm
    const ph = params.pocket_height_mm
    const pcr = params.pocket_corner_radius_mm ?? 0

    // Pocket placement markings on front bodice
    const px0 = fp(pcf)
    const py0 = fp(psh + neckDepthFront)
    const px1 = fp(pcf + pw)
    const py1 = fp(psh + neckDepthFront + ph)

    const pocketCornerPoints: Point[] =
      pcr > 0
        ? [
            { x: fp(px0 + pcr), y: py0 },
            { x: fp(px1 - pcr), y: py0 },
            { x: px1, y: fp(py0 + pcr) },
            { x: px1, y: fp(py1 - pcr) },
            { x: fp(px1 - pcr), y: py1 },
            { x: fp(px0 + pcr), y: py1 },
            { x: px0, y: fp(py1 - pcr) },
            { x: px0, y: fp(py0 + pcr) },
            { x: fp(px0 + pcr), y: py0 },
          ]
        : [
            { x: px0, y: py0 },
            { x: px1, y: py0 },
            { x: px1, y: py1 },
            { x: px0, y: py1 },
            { x: px0, y: py0 },
          ]

    pocketEdges.push({
      seam_id: 'POCKET_MARK',
      edge_type: 'placement',
      allowance_type: 'none',
      points: pocketCornerPoints,
    })
  }

  const allEdges = [shoulderEdge, sideSeamEdge, armholeEdge, necklineEdge, hemEdge, ...pocketEdges]
  const allPoints = [
    ...cutContour,
    ...allEdges.flatMap(e => e.points),
    ...notches.map(n => n.position),
  ]
  const bb = bbox(allPoints)

  return {
    name: 'Front Bodice',
    cut_quantity: 1,
    mirror: false,
    fold: false,
    units: 'mm',
    cut_contour: cutContour,
    sew_edges: allEdges,
    notches,
    grainline: {
      start: { x: fp(halfChest * 0.3), y: fp(bodyLen * 0.25) },
      end: { x: fp(halfChest * 0.3), y: fp(bodyLen * 0.75) },
    },
    labels: {
      size_label: params.size_label,
      piece_name: 'FRONT BODICE',
      cut_instruction: 'CUT 1',
      version,
    },
    bounding_box: bb,
  }
}

// ─── Back bodice IRPiece ──────────────────────────────────────────────────────
function buildBackBodice(params: TshirtParams, derived: DerivedParams, version: number): IRPiece {
  const sa = params.seam_allowance_mm
  const ham = params.hem_allowance_body_mm
  const halfChest = fp(params.chest_finished_circumference_mm / 4)
  const bodyLen = params.body_length_hps_to_hem_mm
  const halfShoulder = fp(params.shoulder_width_mm / 2)
  const halfNeck = fp(params.neck_width_mm / 2)
  const neckDepthBack = params.neck_depth_back_mm
  const ah = derived.armhole_depth_mm

  // Back neckline (shallower, crew style only)
  const necklinePoints: Point[] = [
    { x: fp(0), y: fp(neckDepthBack * 0.1) },
    { x: fp(halfNeck * 0.4), y: fp(neckDepthBack * 0.9) },
    { x: fp(halfNeck * 0.8), y: fp(neckDepthBack * 0.98) },
    { x: fp(halfNeck), y: fp(neckDepthBack) },
  ]

  // Armhole curve (same depth as front)
  const armholePoints: Point[] = [
    { x: fp(halfShoulder), y: fp(neckDepthBack) },
    { x: fp(halfChest * 0.92), y: fp(ah * 0.3) },
    { x: fp(halfChest), y: fp(ah) },
  ]

  const shoulderEdge: IREdge = {
    seam_id: 'S1',
    edge_type: 'sew',
    allowance_type: 'seam_allowance',
    points: [
      { x: fp(halfNeck), y: fp(neckDepthBack) },
      { x: fp(halfShoulder), y: fp(neckDepthBack) },
    ],
  }

  const sideSeamEdge: IREdge = {
    seam_id: 'S2',
    edge_type: 'sew',
    allowance_type: 'seam_allowance',
    points: [
      { x: fp(halfChest), y: fp(ah) },
      { x: fp(halfChest), y: fp(bodyLen - ham) },
    ],
  }

  const armholeEdge: IREdge = {
    seam_id: 'S3_BACK',
    edge_type: 'sew',
    allowance_type: 'seam_allowance',
    points: armholePoints,
  }

  const necklineEdge: IREdge = {
    seam_id: 'S4',
    edge_type: 'sew',
    allowance_type: 'seam_allowance',
    points: necklinePoints,
  }

  const hemEdge: IREdge = {
    seam_id: 'HEM_BACK',
    edge_type: 'hem',
    allowance_type: 'hem_allowance_body',
    points: [
      { x: fp(halfChest), y: fp(bodyLen - ham) },
      { x: fp(0), y: fp(bodyLen - ham) },
    ],
  }

  const cutContour: Point[] = [
    { x: fp(-sa), y: fp(-sa) },
    ...necklinePoints.map(p => ({ x: fp(p.x), y: fp(p.y - sa) })),
    { x: fp(halfNeck + sa), y: fp(neckDepthBack - sa) },
    { x: fp(halfShoulder + sa), y: fp(neckDepthBack - sa) },
    ...armholePoints.slice(1).map(p => ({ x: fp(p.x + sa), y: fp(p.y) })),
    { x: fp(halfChest + sa), y: fp(bodyLen + ham) },
    { x: fp(0), y: fp(bodyLen + ham) },
  ]

  const notches: IRNotch[] = [
    {
      notch_id: 'N3',
      seam_id: 'S3_BACK',
      position: { x: fp(halfChest * 0.96), y: fp(ah * 0.5) },
      angle_deg: 0,
      length_mm: 8,
    },
    {
      notch_id: 'N4',
      seam_id: 'S2',
      position: { x: fp(halfChest), y: fp(ah + (bodyLen - ham - ah) * 0.5) },
      angle_deg: 0,
      length_mm: 8,
    },
  ]

  const allEdges = [shoulderEdge, sideSeamEdge, armholeEdge, necklineEdge, hemEdge]
  const allPoints = [
    ...cutContour,
    ...allEdges.flatMap(e => e.points),
    ...notches.map(n => n.position),
  ]

  return {
    name: 'Back Bodice',
    cut_quantity: 1,
    mirror: false,
    fold: false,
    units: 'mm',
    cut_contour: cutContour,
    sew_edges: allEdges,
    notches,
    grainline: {
      start: { x: fp(halfChest * 0.3), y: fp(bodyLen * 0.25) },
      end: { x: fp(halfChest * 0.3), y: fp(bodyLen * 0.75) },
    },
    labels: {
      size_label: params.size_label,
      piece_name: 'BACK BODICE',
      cut_instruction: 'CUT 1',
      version,
    },
    bounding_box: bbox(allPoints),
  }
}

// ─── Sleeve IRPiece ───────────────────────────────────────────────────────────
function buildSleeve(
  params: TshirtParams,
  derived: DerivedParams,
  version: number,
  frontArmholeLength: number,
  backArmholeLength: number
): { piece: IRPiece; capAdjusted: boolean; capAdjustmentMm: number } {
  const sa = params.seam_allowance_mm
  const has = params.hem_allowance_sleeve_mm
  const sleeveLen = params.sleeve_length_mm
  const bicep = params.bicep_width_mm
  const opening = params.sleeve_opening_width_mm

  let capHeight = derived.sleeve_cap_height_mm
  const armholeTarget = frontArmholeLength + backArmholeLength
  let capAdjusted = false
  let capAdjustmentMm = 0

  // Auto-correct cap height to match armhole sew edge length
  for (let iter = 0; iter < 10; iter++) {
    // Approximate cap sew length: 2 * diagonal from underarm to cap top (simplified)
    const capSewLength = 2 * fp(Math.sqrt(capHeight * capHeight + (bicep / 2) * (bicep / 2)))
    const delta = armholeTarget - capSewLength
    if (Math.abs(delta) <= 5) break
    const adjustment = fp(delta * 0.2)
    capHeight = fp(capHeight + adjustment)
    capAdjusted = true
    capAdjustmentMm = fp(capAdjustmentMm + adjustment)
  }
  capHeight = fp(Math.max(capHeight, 30)) // floor

  // Sleeve outline: trapezoid with cap curve
  // x: 0 = left underarm, bicep = right underarm
  // y: 0 = cap top, increases down toward hem
  const capPoints: Point[] = [
    { x: fp(0), y: fp(capHeight) },                            // left underarm
    { x: fp(bicep * 0.12), y: fp(capHeight * 0.35) },          // left cap curve
    { x: fp(bicep * 0.35), y: fp(capHeight * 0.08) },          // left cap upper
    { x: fp(bicep / 2), y: fp(0) },                            // cap top center
    { x: fp(bicep * 0.65), y: fp(capHeight * 0.08) },          // right cap upper
    { x: fp(bicep * 0.88), y: fp(capHeight * 0.35) },          // right cap curve
    { x: fp(bicep), y: fp(capHeight) },                        // right underarm
  ]

  // Taper to sleeve opening at hem
  const taper = fp((bicep - opening) / 2)
  const hemY = fp(capHeight + sleeveLen)

  const hemPoints: Point[] = [
    { x: fp(bicep), y: fp(hemY - has) },
    { x: fp(bicep - taper), y: fp(hemY - has) },
    { x: fp(taper), y: fp(hemY - has) },
    { x: fp(0), y: fp(hemY - has) },
  ]

  // Sew edges
  const capEdge: IREdge = {
    seam_id: 'S3_CAP',
    edge_type: 'sew',
    allowance_type: 'seam_allowance',
    points: capPoints,
  }

  const underarmEdgeLeft: IREdge = {
    seam_id: 'S5',
    edge_type: 'sew',
    allowance_type: 'seam_allowance',
    points: [
      { x: fp(0), y: fp(capHeight) },
      { x: fp(taper), y: fp(hemY - has) },
    ],
  }

  const underarmEdgeRight: IREdge = {
    seam_id: 'S5',
    edge_type: 'sew',
    allowance_type: 'seam_allowance',
    points: [
      { x: fp(bicep), y: fp(capHeight) },
      { x: fp(bicep - taper), y: fp(hemY - has) },
    ],
  }

  const hemEdge: IREdge = {
    seam_id: 'HEM_SLEEVE',
    edge_type: 'hem',
    allowance_type: 'hem_allowance_sleeve',
    points: [hemPoints[2], hemPoints[3]],
  }

  // Cut contour (includes allowances)
  const cutContour: Point[] = [
    { x: fp(-sa), y: fp(capHeight + sa) },
    ...capPoints.slice(1, -1).map(p => ({ x: fp(p.x), y: fp(p.y - sa) })),
    { x: fp(bicep + sa), y: fp(capHeight + sa) },
    { x: fp(bicep - taper + sa), y: fp(hemY + has) },
    { x: fp(taper - sa), y: fp(hemY + has) },
  ]

  const notches: IRNotch[] = [
    {
      notch_id: 'N5',
      seam_id: 'S3_CAP',
      position: { x: fp(bicep / 2), y: fp(0) },
      angle_deg: 90,
      length_mm: 10,
    },
    {
      notch_id: 'N6',
      seam_id: 'S3_CAP',
      position: { x: fp(bicep * 0.75), y: fp(capHeight * 0.2) },
      angle_deg: 45,
      length_mm: 8,
    },
    {
      notch_id: 'N7',
      seam_id: 'S5',
      position: { x: fp(bicep / 2), y: fp(capHeight + sleeveLen * 0.5) },
      angle_deg: 90,
      length_mm: 8,
    },
  ]

  const allEdges = [capEdge, underarmEdgeLeft, underarmEdgeRight, hemEdge]
  const allPoints = [
    ...cutContour,
    ...allEdges.flatMap(e => e.points),
    ...notches.map(n => n.position),
  ]

  const piece: IRPiece = {
    name: 'Sleeve',
    cut_quantity: 2,
    mirror: true,
    fold: false,
    units: 'mm',
    cut_contour: cutContour,
    sew_edges: allEdges,
    notches,
    grainline: {
      start: { x: fp(bicep / 2), y: fp(capHeight + sleeveLen * 0.2) },
      end: { x: fp(bicep / 2), y: fp(capHeight + sleeveLen * 0.8) },
    },
    labels: {
      size_label: params.size_label,
      piece_name: 'SLEEVE',
      cut_instruction: 'CUT 2',
      version,
    },
    bounding_box: bbox(allPoints),
  }

  return { piece, capAdjusted, capAdjustmentMm }
}

// ─── Neckband IRPiece ─────────────────────────────────────────────────────────
function buildNeckband(params: TshirtParams, derived: DerivedParams, version: number): IRPiece {
  const sa = params.seam_allowance_mm
  // Neckline perimeter: front arc + back arc (approximation)
  const halfNeck = params.neck_width_mm / 2
  const frontArcLen = fp(halfNeck * Math.PI * 0.5 + params.neck_depth_front_mm * 1.1) // approx front neckline length (half)
  const backArcLen = fp(halfNeck * Math.PI * 0.35 + params.neck_depth_back_mm * 0.8)  // approx back neckline length (half)
  const necklinePerimeter = fp((frontArcLen + backArcLen) * 2)
  const bandLength = fp(necklinePerimeter * derived.neckband_length_ratio)
  const bandWidth = fp(params.neckband_finished_width_mm * 2) // doubled for fold-in-half

  const outline: Point[] = [
    { x: fp(0), y: fp(0) },
    { x: fp(bandLength), y: fp(0) },
    { x: fp(bandLength), y: fp(bandWidth) },
    { x: fp(0), y: fp(bandWidth) },
    { x: fp(0), y: fp(0) },
  ]

  const sewEdgeTop: IREdge = {
    seam_id: 'S4',
    edge_type: 'sew',
    allowance_type: 'seam_allowance',
    points: [
      { x: fp(0), y: fp(0) },
      { x: fp(bandLength), y: fp(0) },
    ],
  }

  const sewEdgeBottom: IREdge = {
    seam_id: 'S4',
    edge_type: 'sew',
    allowance_type: 'seam_allowance',
    points: [
      { x: fp(bandLength), y: fp(bandWidth) },
      { x: fp(0), y: fp(bandWidth) },
    ],
  }

  const foldEdge: IREdge = {
    seam_id: 'FOLD_NB',
    edge_type: 'fold',
    allowance_type: 'none',
    points: [
      { x: fp(0), y: fp(bandWidth / 2) },
      { x: fp(bandLength), y: fp(bandWidth / 2) },
    ],
  }

  const joinEdgeLeft: IREdge = {
    seam_id: 'NB_JOIN',
    edge_type: 'sew',
    allowance_type: 'seam_allowance',
    points: [
      { x: fp(0), y: fp(0) },
      { x: fp(0), y: fp(bandWidth) },
    ],
  }

  const joinEdgeRight: IREdge = {
    seam_id: 'NB_JOIN',
    edge_type: 'sew',
    allowance_type: 'seam_allowance',
    points: [
      { x: fp(bandLength), y: fp(0) },
      { x: fp(bandLength), y: fp(bandWidth) },
    ],
  }

  const cutContour: Point[] = [
    { x: fp(-sa), y: fp(-sa) },
    { x: fp(bandLength + sa), y: fp(-sa) },
    { x: fp(bandLength + sa), y: fp(bandWidth + sa) },
    { x: fp(-sa), y: fp(bandWidth + sa) },
  ]

  const notches: IRNotch[] = [
    {
      notch_id: 'N8',
      seam_id: 'S4',
      position: { x: fp(bandLength / 2), y: fp(0) },
      angle_deg: 90,
      length_mm: 8,
    },
  ]

  return {
    name: 'Neckband',
    cut_quantity: 1,
    mirror: false,
    fold: true,
    units: 'mm',
    cut_contour: cutContour,
    sew_edges: [sewEdgeTop, sewEdgeBottom, foldEdge, joinEdgeLeft, joinEdgeRight],
    notches,
    grainline: {
      start: { x: fp(bandLength * 0.2), y: fp(bandWidth * 0.25) },
      end: { x: fp(bandLength * 0.8), y: fp(bandWidth * 0.25) },
    },
    labels: {
      size_label: params.size_label,
      piece_name: 'NECKBAND',
      cut_instruction: 'CUT 1 – FOLD AT CENTER',
      version,
    },
    bounding_box: bbox([...outline, ...cutContour]),
  }
}

// ─── Pocket IRPiece ───────────────────────────────────────────────────────────
function buildPocket(params: TshirtParams, version: number): IRPiece | null {
  if (!params.pocket_enabled || !params.pocket_width_mm || !params.pocket_height_mm) return null

  const sa = params.seam_allowance_mm
  const pw = params.pocket_width_mm
  const ph = params.pocket_height_mm
  const pcr = params.pocket_corner_radius_mm ?? 0

  const outline: Point[] =
    pcr > 0
      ? [
          { x: fp(pcr), y: fp(0) },
          { x: fp(pw - pcr), y: fp(0) },
          { x: fp(pw), y: fp(pcr) },
          { x: fp(pw), y: fp(ph - pcr) },
          { x: fp(pw - pcr), y: fp(ph) },
          { x: fp(pcr), y: fp(ph) },
          { x: fp(0), y: fp(ph - pcr) },
          { x: fp(0), y: fp(pcr) },
          { x: fp(pcr), y: fp(0) },
        ]
      : [
          { x: fp(0), y: fp(0) },
          { x: fp(pw), y: fp(0) },
          { x: fp(pw), y: fp(ph) },
          { x: fp(0), y: fp(ph) },
          { x: fp(0), y: fp(0) },
        ]

  const allSewEdge: IREdge = {
    seam_id: 'S6',
    edge_type: 'sew',
    allowance_type: 'seam_allowance',
    points: outline,
  }

  const cutContour: Point[] = [
    { x: fp(-sa), y: fp(-sa) },
    { x: fp(pw + sa), y: fp(-sa) },
    { x: fp(pw + sa), y: fp(ph + sa) },
    { x: fp(-sa), y: fp(ph + sa) },
    { x: fp(-sa), y: fp(-sa) },
  ]

  return {
    name: 'Pocket',
    cut_quantity: 1,
    mirror: false,
    fold: false,
    units: 'mm',
    cut_contour: cutContour,
    sew_edges: [allSewEdge],
    notches: [],
    grainline: {
      start: { x: fp(pw / 2), y: fp(ph * 0.2) },
      end: { x: fp(pw / 2), y: fp(ph * 0.8) },
    },
    labels: {
      size_label: params.size_label,
      piece_name: 'POCKET',
      cut_instruction: 'CUT 1',
      version,
    },
    bounding_box: bbox([...outline, ...cutContour]),
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function generateTshirtPattern(
  params: TshirtParams,
  version: number
): GenerationResult {
  const derivedBase = computeDerived(params)

  // Build front and back first to get armhole lengths for sleeve cap auto-correct
  const frontPiece = buildFrontBodice(params, { ...derivedBase, sleeve_cap_adjusted: false, sleeve_cap_adjustment_mm: 0 }, version)
  const backPiece = buildBackBodice(params, { ...derivedBase, sleeve_cap_adjusted: false, sleeve_cap_adjustment_mm: 0 }, version)

  // Measure actual armhole sew edge lengths from PatternIR
  const frontArmhole = frontPiece.sew_edges.find(e => e.seam_id === 'S3')
  const backArmhole = backPiece.sew_edges.find(e => e.seam_id === 'S3_BACK')
  const frontArmholeLen = frontArmhole ? polylineLength(frontArmhole.points) : derivedBase.armhole_depth_mm * 1.5
  const backArmholeLen = backArmhole ? polylineLength(backArmhole.points) : derivedBase.armhole_depth_mm * 1.5

  // Build sleeve with auto-correct
  const { piece: sleevePiece, capAdjusted, capAdjustmentMm } = buildSleeve(
    params,
    { ...derivedBase, sleeve_cap_adjusted: false, sleeve_cap_adjustment_mm: 0 },
    version,
    frontArmholeLen,
    backArmholeLen
  )

  // Re-derive sleeve_cap_height_mm from auto-corrected value
  const actualCapHeight = sleevePiece.sew_edges
    .find(e => e.seam_id === 'S3_CAP')?.points[0]?.y ?? derivedBase.sleeve_cap_height_mm

  const derived: DerivedParams = {
    ...derivedBase,
    sleeve_cap_height_mm: fp(actualCapHeight),
    sleeve_cap_adjusted: capAdjusted,
    sleeve_cap_adjustment_mm: fp(capAdjustmentMm),
  }

  const neckbandPiece = buildNeckband(params, derived, version)
  const pocketPiece = buildPocket(params, version)

  const irPieces: IRPiece[] = [frontPiece, backPiece, sleevePiece, neckbandPiece]
  if (pocketPiece) irPieces.push(pocketPiece)

  const ir: PatternIR = {
    template_type: 'tshirt',
    schema_version: 2,
    params,
    derived,
    pieces: irPieces,
  }

  const pieces = irPieces.map(irPieceToPatternPiece)

  return { ir, pieces }
}

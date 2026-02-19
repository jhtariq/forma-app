import type { PatternIR, PatternPiece, IREdge, IRNotch, Point } from './types'

function fp(n: number): number {
  return parseFloat(n.toFixed(2))
}

let handleCounter = 100

function nextHandle(): string {
  handleCounter++
  return handleCounter.toString(16).toUpperCase()
}

function dxfLine(code: number, value: string | number): string {
  return `  ${code}\n${value}`
}

function layerEntry(name: string, color: number): string[] {
  return [
    dxfLine(0, 'LAYER'),
    dxfLine(2, name),
    dxfLine(70, 0),
    dxfLine(62, color),
    dxfLine(6, 'CONTINUOUS'),
  ]
}

// ─── DXF semantic layer standard ─────────────────────────────────────────────
// CUT=7(white) SEW=4(cyan) ALLOWANCE=3(green) HEM=5(blue) NOTCH=6(magenta)
// GRAIN=8(dark gray) FOLD=2(yellow) TEXT=1(red) INTERNAL=9(gray)
const SEMANTIC_LAYERS: { name: string; color: number }[] = [
  { name: 'CUT', color: 7 },
  { name: 'SEW', color: 4 },
  { name: 'ALLOWANCE', color: 3 },
  { name: 'HEM', color: 5 },
  { name: 'NOTCH', color: 6 },
  { name: 'GRAIN', color: 8 },
  { name: 'FOLD', color: 2 },
  { name: 'TEXT', color: 1 },
  { name: 'INTERNAL', color: 9 },
  { name: 'PLACEMENT', color: 30 },
]

function edgeTypeToLayer(edgeType: IREdge['edge_type']): string {
  switch (edgeType) {
    case 'cut': return 'CUT'
    case 'sew': return 'SEW'
    case 'hem': return 'HEM'
    case 'fold': return 'FOLD'
    case 'internal': return 'INTERNAL'
    case 'placement': return 'PLACEMENT'
    default: return 'SEW'
  }
}

function renderPolylineDxf(points: Point[], layer: string, closed: boolean, offsetX: number, offsetY: number): string[] {
  const lines: string[] = []
  lines.push(dxfLine(0, 'LWPOLYLINE'))
  lines.push(dxfLine(5, nextHandle()))
  lines.push(dxfLine(8, layer))
  lines.push(dxfLine(90, points.length))
  lines.push(dxfLine(70, closed ? 1 : 0))
  for (const p of points) {
    lines.push(dxfLine(10, fp(p.x + offsetX)))
    lines.push(dxfLine(20, fp(p.y + offsetY)))
  }
  return lines
}

function renderNotchDxf(notch: IRNotch, offsetX: number, offsetY: number): string[] {
  const len = notch.length_mm / 2
  const angleRad = (notch.angle_deg * Math.PI) / 180
  const dx = fp(len * Math.cos(angleRad))
  const dy = fp(len * Math.sin(angleRad))
  const lines: string[] = []
  lines.push(dxfLine(0, 'LINE'))
  lines.push(dxfLine(5, nextHandle()))
  lines.push(dxfLine(8, 'NOTCH'))
  lines.push(dxfLine(10, fp(notch.position.x + offsetX - dx)))
  lines.push(dxfLine(20, fp(notch.position.y + offsetY - dy)))
  lines.push(dxfLine(11, fp(notch.position.x + offsetX + dx)))
  lines.push(dxfLine(21, fp(notch.position.y + offsetY + dy)))
  return lines
}

function renderTextDxf(content: string, x: number, y: number, height: number): string[] {
  const lines: string[] = []
  lines.push(dxfLine(0, 'TEXT'))
  lines.push(dxfLine(5, nextHandle()))
  lines.push(dxfLine(8, 'TEXT'))
  lines.push(dxfLine(10, fp(x)))
  lines.push(dxfLine(20, fp(y)))
  lines.push(dxfLine(40, height))
  lines.push(dxfLine(1, content))
  return lines
}

// ─── renderDxf: accepts PatternIR (v2) ───────────────────────────────────────
export function renderDxf(ir: PatternIR): string {
  // Reset handle counter for deterministic output
  handleCounter = 100

  const lines: string[] = []

  // HEADER
  lines.push(dxfLine(0, 'SECTION'))
  lines.push(dxfLine(2, 'HEADER'))
  lines.push(dxfLine(9, '$ACADVER'))
  lines.push(dxfLine(1, 'AC1015'))
  lines.push(dxfLine(9, '$INSUNITS'))
  lines.push(dxfLine(70, 4)) // 4 = millimeters
  lines.push(dxfLine(0, 'ENDSEC'))

  // TABLES — semantic layers
  lines.push(dxfLine(0, 'SECTION'))
  lines.push(dxfLine(2, 'TABLES'))
  lines.push(dxfLine(0, 'TABLE'))
  lines.push(dxfLine(2, 'LAYER'))
  for (const { name, color } of SEMANTIC_LAYERS) {
    lines.push(...layerEntry(name, color))
  }
  lines.push(dxfLine(0, 'ENDTAB'))
  lines.push(dxfLine(0, 'ENDSEC'))

  // ENTITIES
  lines.push(dxfLine(0, 'SECTION'))
  lines.push(dxfLine(2, 'ENTITIES'))

  const gap = 100 // mm gap between pieces
  let xOffset = 0

  for (const piece of ir.pieces) {
    const bb = piece.bounding_box
    const ox = xOffset - bb.minX
    const oy = -bb.minY

    // Cut contour → CUT layer
    lines.push(...renderPolylineDxf(piece.cut_contour, 'CUT', true, ox, oy))

    // Sew edges → semantic layers
    for (const edge of piece.sew_edges) {
      const layer = edgeTypeToLayer(edge.edge_type)
      if (edge.points.length >= 2) {
        lines.push(...renderPolylineDxf(edge.points, layer, false, ox, oy))
      }
    }

    // Notches → NOTCH layer
    for (const notch of piece.notches) {
      lines.push(...renderNotchDxf(notch, ox, oy))
    }

    // Grainline → GRAIN layer
    lines.push(dxfLine(0, 'LINE'))
    lines.push(dxfLine(5, nextHandle()))
    lines.push(dxfLine(8, 'GRAIN'))
    lines.push(dxfLine(10, fp(piece.grainline.start.x + ox)))
    lines.push(dxfLine(20, fp(piece.grainline.start.y + oy)))
    lines.push(dxfLine(11, fp(piece.grainline.end.x + ox)))
    lines.push(dxfLine(21, fp(piece.grainline.end.y + oy)))

    // Text label → TEXT layer
    const labelX = fp((bb.minX + bb.maxX) / 2 + ox)
    const labelY = fp((bb.minY + bb.maxY) / 2 + oy)
    lines.push(...renderTextDxf(
      `${piece.labels.piece_name} ${piece.labels.size_label} v${piece.labels.version}`,
      labelX, labelY, 10
    ))
    lines.push(...renderTextDxf(piece.labels.cut_instruction, labelX, labelY + 14, 8))

    xOffset += (bb.maxX - bb.minX) + gap
  }

  lines.push(dxfLine(0, 'ENDSEC'))
  lines.push(dxfLine(0, 'EOF'))

  return lines.join('\n')
}

// ─── Legacy fallback: renderDxfFromPieces (for old PatternPiece[]) ────────────
export function renderDxfFromPieces(pieces: PatternPiece[]): string {
  handleCounter = 100

  const lines: string[] = []

  lines.push(dxfLine(0, 'SECTION'))
  lines.push(dxfLine(2, 'HEADER'))
  lines.push(dxfLine(9, '$ACADVER'))
  lines.push(dxfLine(1, 'AC1015'))
  lines.push(dxfLine(9, '$INSUNITS'))
  lines.push(dxfLine(70, 4))
  lines.push(dxfLine(0, 'ENDSEC'))

  lines.push(dxfLine(0, 'SECTION'))
  lines.push(dxfLine(2, 'TABLES'))
  lines.push(dxfLine(0, 'TABLE'))
  lines.push(dxfLine(2, 'LAYER'))
  for (const { name, color } of SEMANTIC_LAYERS) {
    lines.push(...layerEntry(name, color))
  }
  lines.push(dxfLine(0, 'ENDTAB'))
  lines.push(dxfLine(0, 'ENDSEC'))

  lines.push(dxfLine(0, 'SECTION'))
  lines.push(dxfLine(2, 'ENTITIES'))

  const gap = 80
  let xOffset = 0

  for (const piece of pieces) {
    const bb = piece.boundingBox
    const ox = xOffset - bb.minX
    const oy = -bb.minY

    for (const entity of piece.entities) {
      switch (entity.type) {
        case 'polyline': {
          lines.push(dxfLine(0, 'LWPOLYLINE'))
          lines.push(dxfLine(5, nextHandle()))
          lines.push(dxfLine(8, 'CUT'))
          lines.push(dxfLine(90, entity.points.length))
          lines.push(dxfLine(70, entity.closed ? 1 : 0))
          for (const p of entity.points) {
            lines.push(dxfLine(10, fp(p.x + ox)))
            lines.push(dxfLine(20, fp(p.y + oy)))
          }
          break
        }
        case 'line': {
          lines.push(dxfLine(0, 'LINE'))
          lines.push(dxfLine(5, nextHandle()))
          lines.push(dxfLine(8, 'SEW'))
          lines.push(dxfLine(10, fp(entity.start.x + ox)))
          lines.push(dxfLine(20, fp(entity.start.y + oy)))
          lines.push(dxfLine(11, fp(entity.end.x + ox)))
          lines.push(dxfLine(21, fp(entity.end.y + oy)))
          break
        }
        case 'notch': {
          const len = entity.length / 2
          const angleRad = (entity.angle * Math.PI) / 180
          const dx = fp(len * Math.cos(angleRad))
          const dy = fp(len * Math.sin(angleRad))
          lines.push(dxfLine(0, 'LINE'))
          lines.push(dxfLine(5, nextHandle()))
          lines.push(dxfLine(8, 'NOTCH'))
          lines.push(dxfLine(10, fp(entity.position.x + ox - dx)))
          lines.push(dxfLine(20, fp(entity.position.y + oy - dy)))
          lines.push(dxfLine(11, fp(entity.position.x + ox + dx)))
          lines.push(dxfLine(21, fp(entity.position.y + oy + dy)))
          break
        }
        case 'grainline': {
          lines.push(dxfLine(0, 'LINE'))
          lines.push(dxfLine(5, nextHandle()))
          lines.push(dxfLine(8, 'GRAIN'))
          lines.push(dxfLine(10, fp(entity.start.x + ox)))
          lines.push(dxfLine(20, fp(entity.start.y + oy)))
          lines.push(dxfLine(11, fp(entity.end.x + ox)))
          lines.push(dxfLine(21, fp(entity.end.y + oy)))
          break
        }
        case 'text': {
          lines.push(dxfLine(0, 'TEXT'))
          lines.push(dxfLine(5, nextHandle()))
          lines.push(dxfLine(8, 'TEXT'))
          lines.push(dxfLine(10, fp(entity.position.x + ox)))
          lines.push(dxfLine(20, fp(entity.position.y + oy)))
          lines.push(dxfLine(40, entity.height))
          lines.push(dxfLine(1, entity.content.replace(/\n/g, ' ')))
          break
        }
      }
    }

    xOffset += (bb.maxX - bb.minX) + gap
  }

  lines.push(dxfLine(0, 'ENDSEC'))
  lines.push(dxfLine(0, 'EOF'))

  return lines.join('\n')
}

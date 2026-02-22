import type { PatternIR, PatternPiece, IRPiece, GeometryEntity, Point } from './types'

function fp(n: number): number {
  return parseFloat(n.toFixed(2))
}

// ─── Edge type styles ─────────────────────────────────────────────────────────
function edgeStrokeStyle(edgeType: string): string {
  switch (edgeType) {
    case 'cut':        return 'stroke="#e2e8f0" stroke-width="1.5"'
    case 'sew':        return 'stroke="#22d3ee" stroke-width="1" stroke-dasharray="6 3"'
    case 'hem':        return 'stroke="#60a5fa" stroke-width="1" stroke-dasharray="8 2 2 2"'
    case 'fold':       return 'stroke="#fbbf24" stroke-width="0.8" stroke-dasharray="2 3"'
    case 'internal':   return 'stroke="#475569" stroke-width="0.5" stroke-dasharray="3 3"'
    case 'placement':  return 'stroke="#fb923c" stroke-width="0.8" stroke-dasharray="4 3"'
    default:           return 'stroke="#94a3b8" stroke-width="0.8"'
  }
}

// ─── Render PatternIR piece ───────────────────────────────────────────────────
function renderIRPieceSvg(piece: IRPiece, offsetX: number, offsetY: number): string {
  const parts: string[] = []

  // Cut contour (closed polygon)
  const cutPts = piece.cut_contour
    .map(p => `${fp(p.x + offsetX)},${fp(p.y + offsetY)}`)
    .join(' ')
  parts.push(`<polygon points="${cutPts}" fill="none" ${edgeStrokeStyle('cut')} />`)

  // Sew edges
  for (const edge of piece.sew_edges) {
    if (edge.points.length < 2) continue
    const pts = edge.points
      .map(p => `${fp(p.x + offsetX)},${fp(p.y + offsetY)}`)
      .join(' ')
    const style = edgeStrokeStyle(edge.edge_type)
    if (edge.points.length === 2) {
      parts.push(`<line x1="${fp(edge.points[0].x + offsetX)}" y1="${fp(edge.points[0].y + offsetY)}" x2="${fp(edge.points[1].x + offsetX)}" y2="${fp(edge.points[1].y + offsetY)}" fill="none" ${style} />`)
    } else {
      const closed = edge.edge_type === 'cut'
      if (closed) {
        parts.push(`<polygon points="${pts}" fill="none" ${style} />`)
      } else {
        parts.push(`<polyline points="${pts}" fill="none" ${style} />`)
      }
    }
  }

  // Notches
  for (const notch of piece.notches) {
    const len = notch.length_mm / 2
    const angleRad = (notch.angle_deg * Math.PI) / 180
    const dx = fp(len * Math.cos(angleRad))
    const dy = fp(len * Math.sin(angleRad))
    const px = fp(notch.position.x + offsetX)
    const py = fp(notch.position.y + offsetY)
    parts.push(`<line x1="${fp(px - dx)}" y1="${fp(py - dy)}" x2="${fp(px + dx)}" y2="${fp(py + dy)}" stroke="#f97316" stroke-width="1.5" />`)
  }

  // Grainline with arrow
  const gs = { x: fp(piece.grainline.start.x + offsetX), y: fp(piece.grainline.start.y + offsetY) }
  const ge = { x: fp(piece.grainline.end.x + offsetX), y: fp(piece.grainline.end.y + offsetY) }
  const arrowSize = 7
  const gAngle = Math.atan2(ge.y - gs.y, ge.x - gs.x)
  const a1x = fp(ge.x - arrowSize * Math.cos(gAngle - 0.4))
  const a1y = fp(ge.y - arrowSize * Math.sin(gAngle - 0.4))
  const a2x = fp(ge.x - arrowSize * Math.cos(gAngle + 0.4))
  const a2y = fp(ge.y - arrowSize * Math.sin(gAngle + 0.4))
  parts.push(`<line x1="${gs.x}" y1="${gs.y}" x2="${ge.x}" y2="${ge.y}" stroke="#64748b" stroke-width="0.8" stroke-dasharray="6 3" />`)
  parts.push(`<polygon points="${ge.x},${ge.y} ${a1x},${a1y} ${a2x},${a2y}" fill="#64748b" />`)

  return parts.join('\n')
}

// ─── Render legacy PatternPiece entity ───────────────────────────────────────
function renderLegacyEntity(entity: GeometryEntity, offsetX: number, offsetY: number): string {
  switch (entity.type) {
    case 'polyline': {
      const pts = entity.points
        .map((p) => `${fp(p.x + offsetX)},${fp(p.y + offsetY)}`)
        .join(' ')
      if (entity.closed) {
        return `<polygon points="${pts}" fill="none" stroke="#e2e8f0" stroke-width="1" />`
      }
      return `<polyline points="${pts}" fill="none" stroke="#e2e8f0" stroke-width="1" />`
    }
    case 'line':
      return `<line x1="${fp(entity.start.x + offsetX)}" y1="${fp(entity.start.y + offsetY)}" x2="${fp(entity.end.x + offsetX)}" y2="${fp(entity.end.y + offsetY)}" stroke="#94a3b8" stroke-width="0.5" stroke-dasharray="4 2" />`
    case 'arc': {
      const r = entity.radius
      const startRad = (entity.startAngle * Math.PI) / 180
      const endRad = (entity.endAngle * Math.PI) / 180
      const sx = fp(entity.center.x + r * Math.cos(startRad) + offsetX)
      const sy = fp(entity.center.y + r * Math.sin(startRad) + offsetY)
      const ex = fp(entity.center.x + r * Math.cos(endRad) + offsetX)
      const ey = fp(entity.center.y + r * Math.sin(endRad) + offsetY)
      const largeArc = Math.abs(entity.endAngle - entity.startAngle) > 180 ? 1 : 0
      return `<path d="M ${sx} ${sy} A ${fp(r)} ${fp(r)} 0 ${largeArc} 1 ${ex} ${ey}" fill="none" stroke="#fb923c" stroke-width="1" />`
    }
    case 'circle':
      return `<circle cx="${fp(entity.center.x + offsetX)}" cy="${fp(entity.center.y + offsetY)}" r="${fp(entity.radius)}" fill="none" stroke="#e2e8f0" stroke-width="1" />`
    case 'text':
      return `<text x="${fp(entity.position.x + offsetX)}" y="${fp(entity.position.y + offsetY)}" fill="#94a3b8" font-size="${entity.height}" font-family="monospace"${entity.rotation ? ` transform="rotate(${entity.rotation} ${fp(entity.position.x + offsetX)} ${fp(entity.position.y + offsetY)})"` : ''}>${entity.content.replace(/\n/g, ' ')}</text>`
    case 'notch': {
      const len = entity.length / 2
      const angleRad = (entity.angle * Math.PI) / 180
      const dx = fp(len * Math.cos(angleRad))
      const dy = fp(len * Math.sin(angleRad))
      const px = fp(entity.position.x + offsetX)
      const py = fp(entity.position.y + offsetY)
      return `<line x1="${fp(px - dx)}" y1="${fp(py - dy)}" x2="${fp(px + dx)}" y2="${fp(py + dy)}" stroke="#f97316" stroke-width="1.5" />`
    }
    case 'grainline': {
      const sx = fp(entity.start.x + offsetX)
      const sy = fp(entity.start.y + offsetY)
      const ex = fp(entity.end.x + offsetX)
      const ey = fp(entity.end.y + offsetY)
      const arrowSize = 6
      const angle = Math.atan2(ey - sy, ex - sx)
      const a1x = fp(ex - arrowSize * Math.cos(angle - 0.4))
      const a1y = fp(ey - arrowSize * Math.sin(angle - 0.4))
      const a2x = fp(ex - arrowSize * Math.cos(angle + 0.4))
      const a2y = fp(ey - arrowSize * Math.sin(angle + 0.4))
      return [
        `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="#64748b" stroke-width="0.8" stroke-dasharray="6 3" />`,
        `<polygon points="${ex},${ey} ${a1x},${a1y} ${a2x},${a2y}" fill="#64748b" />`,
      ].join('\n')
    }
    default:
      return ''
  }
}

// ─── Shared grid layout helper ────────────────────────────────────────────────
interface PieceLayout {
  name: string
  width: number
  height: number
  label: string
  subLabel?: string
}

function buildGridSvg(
  items: PieceLayout[],
  renderItem: (item: PieceLayout, idx: number, offsetX: number, offsetY: number) => string
): string {
  const padding = 40
  const gap = 60
  const labelHeight = 28
  const cols = 2
  const rows = Math.ceil(items.length / cols)

  const colWidths: number[] = Array(cols).fill(0)
  const rowHeights: number[] = Array(rows).fill(0)

  items.forEach((item, idx) => {
    const c = idx % cols
    const r = Math.floor(idx / cols)
    if (item.width > colWidths[c]) colWidths[c] = item.width
    if (item.height > rowHeights[r]) rowHeights[r] = item.height
  })

  const totalWidth = colWidths.reduce((a, b) => a + b, 0) + gap * (cols - 1) + padding * 2
  const totalHeight =
    rowHeights.reduce((a, b) => a + b, 0) + gap * (rows - 1) + padding * 2 + labelHeight * rows

  const svgParts: string[] = []
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fp(totalWidth)} ${fp(totalHeight)}" width="${fp(totalWidth)}" height="${fp(totalHeight)}">`
  )
  svgParts.push(`<rect width="100%" height="100%" fill="#0f172a" />`)

  // Legend
  const legendY = 14
  const legendItems = [
    { color: '#e2e8f0', dash: '', label: 'Cut' },
    { color: '#22d3ee', dash: '6,3', label: 'Sew' },
    { color: '#60a5fa', dash: '8,2,2,2', label: 'Hem' },
    { color: '#fbbf24', dash: '2,3', label: 'Fold' },
    { color: '#fb923c', dash: '4,3', label: 'Placement' },
    { color: '#f97316', dash: '', label: 'Notch' },
  ]
  let lx = padding
  for (const li of legendItems) {
    const dashAttr = li.dash ? ` stroke-dasharray="${li.dash}"` : ''
    svgParts.push(`<line x1="${lx}" y1="${legendY}" x2="${lx + 18}" y2="${legendY}" stroke="${li.color}" stroke-width="1.5"${dashAttr} />`)
    svgParts.push(`<text x="${lx + 22}" y="${legendY + 4}" fill="#94a3b8" font-size="9" font-family="monospace">${li.label}</text>`)
    lx += 72
  }

  let yOffset = padding + 20 // extra space for legend

  for (let r = 0; r < rows; r++) {
    let xOffset = padding

    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      if (idx >= items.length) break
      const item = items[idx]

      // Piece label
      svgParts.push(
        `<text x="${fp(xOffset)}" y="${fp(yOffset + 14)}" fill="#f8fafc" font-size="13" font-family="monospace" font-weight="bold">${item.label}</text>`
      )
      if (item.subLabel) {
        svgParts.push(
          `<text x="${fp(xOffset)}" y="${fp(yOffset + 25)}" fill="#64748b" font-size="9" font-family="monospace">${item.subLabel}</text>`
        )
      }

      // Border box
      const boxW = colWidths[c]
      const boxH = rowHeights[r]
      svgParts.push(
        `<rect x="${fp(xOffset - 8)}" y="${fp(yOffset + labelHeight - 8)}" width="${fp(boxW + 16)}" height="${fp(boxH + 16)}" fill="none" stroke="#1e293b" stroke-width="1" rx="4" />`
      )

      // Actual piece content rendered
      svgParts.push(renderItem(item, idx, xOffset, yOffset + labelHeight))

      xOffset += colWidths[c] + gap
    }

    yOffset += rowHeights[r] + labelHeight + gap
  }

  svgParts.push('</svg>')
  return svgParts.join('\n')
}

// ─── Main: renderSvg accepts PatternIR (primary) ─────────────────────────────
export function renderSvg(ir: PatternIR): string {
  const irPieces = ir.pieces

  const items: PieceLayout[] = irPieces.map(piece => ({
    name: piece.name,
    width: piece.bounding_box.maxX - piece.bounding_box.minX,
    height: piece.bounding_box.maxY - piece.bounding_box.minY,
    label: `${piece.labels.piece_name}  |  ${piece.labels.cut_instruction}`,
    subLabel: `${piece.labels.size_label}  v${piece.labels.version}`,
  }))

  return buildGridSvg(items, (item, idx, offsetX, offsetY) => {
    const piece = irPieces[idx]
    const entityOffsetX = offsetX - piece.bounding_box.minX
    const entityOffsetY = offsetY - piece.bounding_box.minY
    return renderIRPieceSvg(piece, entityOffsetX, entityOffsetY)
  })
}

// ─── Legacy: renderSvgFromPieces (old PatternPiece[]) ────────────────────────
export function renderSvgFromPieces(pieces: PatternPiece[]): string {
  const items: PieceLayout[] = pieces.map(p => ({
    name: p.name,
    width: p.boundingBox.maxX - p.boundingBox.minX,
    height: p.boundingBox.maxY - p.boundingBox.minY,
    label: p.name,
  }))

  return buildGridSvg(items, (item, idx, offsetX, offsetY) => {
    const piece = pieces[idx]
    const entityOffsetX = offsetX - piece.boundingBox.minX
    const entityOffsetY = offsetY - piece.boundingBox.minY
    return piece.entities
      .map(e => renderLegacyEntity(e, entityOffsetX, entityOffsetY))
      .join('\n')
  })
}

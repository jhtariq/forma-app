import type { PatternPiece, GeometryEntity, Point } from './types'

function fp(n: number): number {
  return parseFloat(n.toFixed(2))
}

function renderEntity(entity: GeometryEntity, offsetX: number, offsetY: number): string {
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
      return `<text x="${fp(entity.position.x + offsetX)}" y="${fp(entity.position.y + offsetY)}" fill="#94a3b8" font-size="${entity.height}" font-family="monospace"${entity.rotation ? ` transform="rotate(${entity.rotation} ${fp(entity.position.x + offsetX)} ${fp(entity.position.y + offsetY)})"` : ''}>${entity.content}</text>`

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
      // Arrow at end
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

export function renderSvg(pieces: PatternPiece[]): string {
  const padding = 40
  const gap = 60

  // Calculate piece dimensions
  const pieceSizes = pieces.map((p) => ({
    width: p.boundingBox.maxX - p.boundingBox.minX,
    height: p.boundingBox.maxY - p.boundingBox.minY,
    piece: p,
  }))

  // 2x2 grid layout
  const cols = 2
  const rows = Math.ceil(pieces.length / cols)

  // Find max width per column and max height per row
  const colWidths: number[] = []
  const rowHeights: number[] = []

  for (let r = 0; r < rows; r++) {
    let maxH = 0
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      if (idx < pieceSizes.length) {
        if (!colWidths[c] || pieceSizes[idx].width > colWidths[c]) {
          colWidths[c] = pieceSizes[idx].width
        }
        if (pieceSizes[idx].height > maxH) {
          maxH = pieceSizes[idx].height
        }
      }
    }
    rowHeights.push(maxH)
  }

  const totalWidth = colWidths.reduce((a, b) => a + b, 0) + gap * (cols - 1) + padding * 2
  const labelHeight = 24
  const totalHeight = rowHeights.reduce((a, b) => a + b, 0) + gap * (rows - 1) + padding * 2 + labelHeight * rows

  const svgParts: string[] = []
  svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fp(totalWidth)} ${fp(totalHeight)}" width="${fp(totalWidth)}" height="${fp(totalHeight)}">`)
  svgParts.push(`<rect width="100%" height="100%" fill="#0f172a" />`)

  let yOffset = padding

  for (let r = 0; r < rows; r++) {
    let xOffset = padding

    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      if (idx >= pieceSizes.length) break

      const { piece } = pieceSizes[idx]
      const entityOffsetX = xOffset - piece.boundingBox.minX
      const entityOffsetY = yOffset + labelHeight - piece.boundingBox.minY

      // Piece label
      svgParts.push(`<text x="${fp(xOffset)}" y="${fp(yOffset + 14)}" fill="#f8fafc" font-size="14" font-family="monospace" font-weight="bold">${piece.name}</text>`)

      // Piece border box
      const boxW = colWidths[c]
      const boxH = rowHeights[r]
      svgParts.push(`<rect x="${fp(xOffset - 8)}" y="${fp(yOffset + labelHeight - 8)}" width="${fp(boxW + 16)}" height="${fp(boxH + 16)}" fill="none" stroke="#1e293b" stroke-width="1" rx="4" />`)

      // Render entities
      for (const entity of piece.entities) {
        svgParts.push(renderEntity(entity, entityOffsetX, entityOffsetY))
      }

      xOffset += colWidths[c] + gap
    }

    yOffset += rowHeights[r] + labelHeight + gap
  }

  svgParts.push('</svg>')
  return svgParts.join('\n')
}

import type { PatternIR, IRPiece, Point } from './types'

function fp(n: number): number {
  return parseFloat(n.toFixed(2))
}

function scalePoints(pts: Point[], scaleX: number, scaleY: number, offsetX: number, offsetY: number): string {
  return pts
    .map(p => `${fp(p.x * scaleX + offsetX)},${fp(p.y * scaleY + offsetY)}`)
    .join(' ')
}

function renderOutlinePolyline(pts: Point[], scaleX: number, scaleY: number, offsetX: number, offsetY: number): string {
  const scaled = pts.map(p => `${fp(p.x * scaleX + offsetX)},${fp(p.y * scaleY + offsetY)}`).join(' ')
  return `<polygon points="${scaled}" fill="#f8f8f0" stroke="#1a1a1a" stroke-width="1.2" />`
}

function calloutLine(x1: number, y1: number, x2: number, y2: number, label: string): string {
  return [
    `<line x1="${fp(x1)}" y1="${fp(y1)}" x2="${fp(x2)}" y2="${fp(y2)}" stroke="#374151" stroke-width="0.6" stroke-dasharray="3 2" />`,
    `<circle cx="${fp(x1)}" cy="${fp(y1)}" r="1.5" fill="#374151" />`,
    `<text x="${fp(x2 + 4)}" y="${fp(y2 + 4)}" fill="#111827" font-size="9" font-family="Arial, sans-serif">${label}</text>`,
  ].join('\n')
}

export function renderTechSketch(ir: PatternIR): string {
  const { params } = ir
  const SVG_WIDTH = 640
  const SVG_HEIGHT = 440
  const PANEL_W = 270
  const PANEL_H = 360
  const padding = 30

  // Find front and back bodice pieces
  const frontPiece = ir.pieces.find(p => p.name === 'Front Bodice')
  const backPiece = ir.pieces.find(p => p.name === 'Back Bodice')

  if (!frontPiece || !backPiece) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}"><rect width="100%" height="100%" fill="white"/><text x="20" y="40" font-size="14">Tech sketch not available</text></svg>`
  }

  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" width="${SVG_WIDTH}" height="${SVG_HEIGHT}">`)
  parts.push(`<rect width="100%" height="100%" fill="white" />`)

  // Title
  parts.push(`<text x="${SVG_WIDTH / 2}" y="20" text-anchor="middle" fill="#111827" font-size="13" font-weight="bold" font-family="Arial, sans-serif">Technical Sketch — T-Shirt  ${params.size_label}  v${ir.pieces[0]?.labels.version ?? 1}</text>`)
  parts.push(`<text x="${SVG_WIDTH / 2}" y="34" text-anchor="middle" fill="#6b7280" font-size="9" font-family="Arial, sans-serif">${params.fit_profile.toUpperCase()} FIT  ·  ${params.sleeve_type.toUpperCase()} SLEEVE  ·  ${params.neckline_type.toUpperCase()} NECK</text>`)

  // Helper to scale a piece to fit in a panel
  function renderPanelOutline(piece: IRPiece, panelX: number, panelY: number, label: string): void {
    const bb = piece.bounding_box
    const pieceW = bb.maxX - bb.minX
    const pieceH = bb.maxY - bb.minY
    const scaleX = PANEL_W / pieceW
    const scaleY = PANEL_H / pieceH
    const scale = Math.min(scaleX, scaleY) * 0.85
    const ox = panelX + (PANEL_W - pieceW * scale) / 2 - bb.minX * scale
    const oy = panelY + (PANEL_H - pieceH * scale) / 2 - bb.minY * scale

    // Panel box
    parts.push(`<rect x="${fp(panelX)}" y="${fp(panelY)}" width="${PANEL_W}" height="${PANEL_H}" fill="#f9fafb" stroke="#d1d5db" stroke-width="0.8" rx="4" />`)
    parts.push(`<text x="${fp(panelX + PANEL_W / 2)}" y="${fp(panelY - 6)}" text-anchor="middle" fill="#374151" font-size="11" font-weight="bold" font-family="Arial, sans-serif">${label}</text>`)

    // Cut contour outline (simplified schematic style)
    parts.push(renderOutlinePolyline(piece.cut_contour, scale, scale, ox, oy))

    // Grainline
    const gs = piece.grainline.start
    const ge = piece.grainline.end
    const gsx = fp(gs.x * scale + ox)
    const gsy = fp(gs.y * scale + oy)
    const gex = fp(ge.x * scale + ox)
    const gey = fp(ge.y * scale + oy)
    parts.push(`<line x1="${gsx}" y1="${gsy}" x2="${gex}" y2="${gey}" stroke="#6b7280" stroke-width="0.8" stroke-dasharray="5 3" />`)
    // Arrow at grainline end
    const gAngle = Math.atan2(gey - gsy, gex - gsx)
    const a = 6
    parts.push(`<polygon points="${gex},${gey} ${fp(gex - a * Math.cos(gAngle - 0.4))},${fp(gey - a * Math.sin(gAngle - 0.4))} ${fp(gex - a * Math.cos(gAngle + 0.4))},${fp(gey - a * Math.sin(gAngle + 0.4))}" fill="#6b7280" />`)

    // Neckline callout (top of piece)
    const neckEdge = piece.sew_edges.find(e => e.seam_id === 'S4' || e.seam_id.startsWith('S4'))
    if (neckEdge && neckEdge.points.length > 0) {
      const neckPt = neckEdge.points[Math.floor(neckEdge.points.length / 2)]
      const nx = fp(neckPt.x * scale + ox)
      const ny = fp(neckPt.y * scale + oy)
      parts.push(calloutLine(nx, ny, nx - 40, ny - 25, `${params.neckline_type.toUpperCase()} NECK`))
    }

    // Hem callout (bottom)
    const hemEdge = piece.sew_edges.find(e => e.edge_type === 'hem')
    if (hemEdge && hemEdge.points.length > 0) {
      const hemPt = hemEdge.points[0]
      const hx = fp(hemPt.x * scale + ox)
      const hy = fp(hemPt.y * scale + oy)
      parts.push(calloutLine(hx, hy, hx + 30, hy + 20, `HEM ${params.hem_allowance_body_mm}mm`))
    }

    // Pocket callout on front view only
    if (label === 'FRONT VIEW' && params.pocket_enabled && params.pocket_width_mm && params.pocket_height_mm) {
      const placementEdge = piece.sew_edges.find(e => e.seam_id === 'POCKET_MARK')
      if (placementEdge && placementEdge.points.length > 0) {
        const pp = placementEdge.points[0]
        const ppx = fp(pp.x * scale + ox)
        const ppy = fp(pp.y * scale + oy)
        const ppw = fp(params.pocket_width_mm * scale)
        const pph = fp(params.pocket_height_mm * scale)
        parts.push(`<rect x="${ppx}" y="${ppy}" width="${ppw}" height="${pph}" fill="rgba(251,146,60,0.15)" stroke="#fb923c" stroke-width="0.8" stroke-dasharray="3 2" />`)
        parts.push(calloutLine(
          fp(ppx + ppw / 2), fp(ppy + pph / 2),
          fp(ppx + ppw + 20), fp(ppy - 10),
          `POCKET ${params.pocket_width_mm}×${params.pocket_height_mm}mm`
        ))
      }
    }

    // Sleeve callout on front view
    if (label === 'FRONT VIEW') {
      const armholeEdge = piece.sew_edges.find(e => e.seam_id === 'S3')
      if (armholeEdge && armholeEdge.points.length > 0) {
        const ap = armholeEdge.points[armholeEdge.points.length - 1]
        const ax = fp(ap.x * scale + ox)
        const ay = fp(ap.y * scale + oy)
        parts.push(calloutLine(ax, ay, ax + 35, ay - 10, `${params.sleeve_type.toUpperCase()} ${params.sleeve_length_mm}mm`))
      }
    }
  }

  // Render front view (left panel)
  const frontX = padding
  const frontY = 50
  renderPanelOutline(frontPiece, frontX, frontY, 'FRONT VIEW')

  // Render back view (right panel)
  const backX = padding + PANEL_W + 40
  const backY = 50
  renderPanelOutline(backPiece, backX, backY, 'BACK VIEW')

  // Footer: key measurements
  const footerY = SVG_HEIGHT - 16
  const footerParts = [
    `Chest: ${params.chest_finished_circumference_mm}mm`,
    `Body: ${params.body_length_hps_to_hem_mm}mm`,
    `Shoulder: ${params.shoulder_width_mm}mm`,
    `SA: ${params.seam_allowance_mm}mm`,
    `Fabric: ${params.fabric_stretch_class} stretch`,
  ]
  parts.push(`<text x="${SVG_WIDTH / 2}" y="${footerY}" text-anchor="middle" fill="#9ca3af" font-size="8" font-family="Arial, sans-serif">${footerParts.join('  ·  ')}</text>`)
  parts.push(`<line x1="${padding}" y1="${footerY - 10}" x2="${SVG_WIDTH - padding}" y2="${footerY - 10}" stroke="#e5e7eb" stroke-width="0.5" />`)

  parts.push('</svg>')
  return parts.join('\n')
}

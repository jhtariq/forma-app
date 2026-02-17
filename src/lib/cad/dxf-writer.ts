import type { PatternPiece, GeometryEntity } from './types'

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

function renderEntityDxf(entity: GeometryEntity, layer: string, offsetX: number, offsetY: number): string[] {
  const lines: string[] = []

  switch (entity.type) {
    case 'polyline': {
      lines.push(dxfLine(0, 'LWPOLYLINE'))
      lines.push(dxfLine(5, nextHandle()))
      lines.push(dxfLine(8, layer))
      lines.push(dxfLine(90, entity.points.length))
      lines.push(dxfLine(70, entity.closed ? 1 : 0))
      for (const p of entity.points) {
        lines.push(dxfLine(10, fp(p.x + offsetX)))
        lines.push(dxfLine(20, fp(p.y + offsetY)))
      }
      break
    }

    case 'line': {
      lines.push(dxfLine(0, 'LINE'))
      lines.push(dxfLine(5, nextHandle()))
      lines.push(dxfLine(8, layer))
      lines.push(dxfLine(10, fp(entity.start.x + offsetX)))
      lines.push(dxfLine(20, fp(entity.start.y + offsetY)))
      lines.push(dxfLine(11, fp(entity.end.x + offsetX)))
      lines.push(dxfLine(21, fp(entity.end.y + offsetY)))
      break
    }

    case 'arc': {
      lines.push(dxfLine(0, 'ARC'))
      lines.push(dxfLine(5, nextHandle()))
      lines.push(dxfLine(8, layer))
      lines.push(dxfLine(10, fp(entity.center.x + offsetX)))
      lines.push(dxfLine(20, fp(entity.center.y + offsetY)))
      lines.push(dxfLine(40, fp(entity.radius)))
      lines.push(dxfLine(50, fp(entity.startAngle)))
      lines.push(dxfLine(51, fp(entity.endAngle)))
      break
    }

    case 'circle': {
      lines.push(dxfLine(0, 'CIRCLE'))
      lines.push(dxfLine(5, nextHandle()))
      lines.push(dxfLine(8, layer))
      lines.push(dxfLine(10, fp(entity.center.x + offsetX)))
      lines.push(dxfLine(20, fp(entity.center.y + offsetY)))
      lines.push(dxfLine(40, fp(entity.radius)))
      break
    }

    case 'text': {
      lines.push(dxfLine(0, 'TEXT'))
      lines.push(dxfLine(5, nextHandle()))
      lines.push(dxfLine(8, `${layer}_LABELS`))
      lines.push(dxfLine(10, fp(entity.position.x + offsetX)))
      lines.push(dxfLine(20, fp(entity.position.y + offsetY)))
      lines.push(dxfLine(40, entity.height))
      lines.push(dxfLine(1, entity.content))
      if (entity.rotation) {
        lines.push(dxfLine(50, entity.rotation))
      }
      break
    }

    case 'notch': {
      const len = entity.length / 2
      const angleRad = (entity.angle * Math.PI) / 180
      const dx = fp(len * Math.cos(angleRad))
      const dy = fp(len * Math.sin(angleRad))
      lines.push(dxfLine(0, 'LINE'))
      lines.push(dxfLine(5, nextHandle()))
      lines.push(dxfLine(8, 'NOTCHES'))
      lines.push(dxfLine(10, fp(entity.position.x + offsetX - dx)))
      lines.push(dxfLine(20, fp(entity.position.y + offsetY - dy)))
      lines.push(dxfLine(11, fp(entity.position.x + offsetX + dx)))
      lines.push(dxfLine(21, fp(entity.position.y + offsetY + dy)))
      break
    }

    case 'grainline': {
      lines.push(dxfLine(0, 'LINE'))
      lines.push(dxfLine(5, nextHandle()))
      lines.push(dxfLine(8, 'GRAINLINES'))
      lines.push(dxfLine(10, fp(entity.start.x + offsetX)))
      lines.push(dxfLine(20, fp(entity.start.y + offsetY)))
      lines.push(dxfLine(11, fp(entity.end.x + offsetX)))
      lines.push(dxfLine(21, fp(entity.end.y + offsetY)))
      break
    }
  }

  return lines
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

export function renderDxf(pieces: PatternPiece[]): string {
  // Reset handle counter for deterministic output
  handleCounter = 100

  const lines: string[] = []

  // HEADER section
  lines.push(dxfLine(0, 'SECTION'))
  lines.push(dxfLine(2, 'HEADER'))
  lines.push(dxfLine(9, '$ACADVER'))
  lines.push(dxfLine(1, 'AC1015'))
  lines.push(dxfLine(9, '$INSUNITS'))
  lines.push(dxfLine(70, 4)) // 4 = millimeters
  lines.push(dxfLine(0, 'ENDSEC'))

  // TABLES section - layers
  lines.push(dxfLine(0, 'SECTION'))
  lines.push(dxfLine(2, 'TABLES'))
  lines.push(dxfLine(0, 'TABLE'))
  lines.push(dxfLine(2, 'LAYER'))

  // Create layers for each piece + utility layers
  const colors = [7, 1, 3, 5] // white, red, green, blue
  pieces.forEach((piece, i) => {
    const layerName = piece.name.toUpperCase().replace(/\s+/g, '_')
    lines.push(...layerEntry(layerName, colors[i % colors.length]))
    lines.push(...layerEntry(`${layerName}_LABELS`, 2)) // yellow for labels
  })
  lines.push(...layerEntry('NOTCHES', 6)) // magenta
  lines.push(...layerEntry('GRAINLINES', 8)) // dark gray

  lines.push(dxfLine(0, 'ENDTAB'))
  lines.push(dxfLine(0, 'ENDSEC'))

  // ENTITIES section
  lines.push(dxfLine(0, 'SECTION'))
  lines.push(dxfLine(2, 'ENTITIES'))

  // Layout pieces with spacing
  const gap = 80
  let xOffset = 0

  for (const piece of pieces) {
    const layerName = piece.name.toUpperCase().replace(/\s+/g, '_')
    const pieceOffsetX = xOffset - piece.boundingBox.minX
    const pieceOffsetY = -piece.boundingBox.minY

    for (const entity of piece.entities) {
      lines.push(...renderEntityDxf(entity, layerName, pieceOffsetX, pieceOffsetY))
    }

    xOffset += piece.boundingBox.maxX - piece.boundingBox.minX + gap
  }

  lines.push(dxfLine(0, 'ENDSEC'))

  // EOF
  lines.push(dxfLine(0, 'EOF'))

  return lines.join('\n')
}

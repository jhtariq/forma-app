import type { TshirtParams, PatternPiece, Point, GeometryEntity } from './types'

function fp(n: number): number {
  return parseFloat(n.toFixed(2))
}

function computeBoundingBox(entities: GeometryEntity[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const entity of entities) {
    const points: Point[] = []

    switch (entity.type) {
      case 'polyline':
        points.push(...entity.points)
        break
      case 'line':
      case 'grainline':
        points.push(entity.start, entity.end)
        break
      case 'arc':
        points.push(
          { x: entity.center.x - entity.radius, y: entity.center.y - entity.radius },
          { x: entity.center.x + entity.radius, y: entity.center.y + entity.radius },
        )
        break
      case 'circle':
        points.push(
          { x: entity.center.x - entity.radius, y: entity.center.y - entity.radius },
          { x: entity.center.x + entity.radius, y: entity.center.y + entity.radius },
        )
        break
      case 'text':
        points.push(entity.position)
        break
      case 'notch':
        points.push(entity.position)
        break
    }

    for (const p of points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }

  return { minX: fp(minX), minY: fp(minY), maxX: fp(maxX), maxY: fp(maxY) }
}

function generateFrontBodice(params: TshirtParams): PatternPiece {
  const sa = params.seam_allowance_mm
  const halfChest = fp((params.chest_circumference_mm + params.ease_mm) / 4)
  const bodyLength = params.body_length_mm
  const shoulderWidth = fp(params.shoulder_width_mm / 2)
  const neckWidth = fp(params.neck_width_mm / 2)
  const neckDropFront = fp(params.neck_width_mm * 0.4) // front neck drop ~40% of neck width
  const armholeDepth = fp(bodyLength * 0.3)

  const entities: GeometryEntity[] = []

  // Main outline (clockwise from center-top)
  const outline: Point[] = [
    { x: fp(0), y: fp(0) },                                    // center neck
    { x: fp(neckWidth), y: fp(0) },                             // neck edge
    { x: fp(shoulderWidth), y: fp(-sa) },                       // shoulder point
    { x: fp(halfChest), y: fp(armholeDepth) },                   // underarm
    { x: fp(halfChest), y: fp(bodyLength) },                     // hem side
    { x: fp(0), y: fp(bodyLength) },                             // hem center
  ]

  entities.push({ type: 'polyline', points: outline, closed: true })

  // Neckline curve (crew or v-neck)
  if (params.neckline_type === 'v') {
    entities.push({
      type: 'line',
      start: { x: fp(0), y: fp(0) },
      end: { x: fp(0), y: fp(neckDropFront) },
    })
  } else {
    // Crew neck: arc indicator
    entities.push({
      type: 'arc',
      center: { x: fp(neckWidth / 2), y: fp(0) },
      radius: fp(neckWidth / 2),
      startAngle: 180,
      endAngle: 360,
    })
  }

  // Seam allowance outline (offset)
  const saOutline: Point[] = [
    { x: fp(-sa), y: fp(-sa) },
    { x: fp(neckWidth + sa), y: fp(-sa) },
    { x: fp(shoulderWidth + sa), y: fp(-sa * 2) },
    { x: fp(halfChest + sa), y: fp(armholeDepth) },
    { x: fp(halfChest + sa), y: fp(bodyLength + sa) },
    { x: fp(-sa), y: fp(bodyLength + sa) },
  ]
  entities.push({ type: 'polyline', points: saOutline, closed: true })

  // Grainline (vertical center)
  entities.push({
    type: 'grainline',
    start: { x: fp(halfChest * 0.3), y: fp(bodyLength * 0.2) },
    end: { x: fp(halfChest * 0.3), y: fp(bodyLength * 0.8) },
  })

  // Notches
  entities.push({ type: 'notch', position: { x: fp(shoulderWidth / 2), y: fp(-sa / 2) }, angle: 90, length: 8 })
  entities.push({ type: 'notch', position: { x: fp(halfChest), y: fp(armholeDepth / 2) }, angle: 0, length: 8 })

  // Label
  entities.push({
    type: 'text',
    position: { x: fp(halfChest * 0.3), y: fp(bodyLength * 0.5) },
    content: 'FRONT',
    height: 12,
  })

  return {
    name: 'Front Bodice',
    entities,
    boundingBox: computeBoundingBox(entities),
  }
}

function generateBackBodice(params: TshirtParams): PatternPiece {
  const sa = params.seam_allowance_mm
  const halfChest = fp((params.chest_circumference_mm + params.ease_mm) / 4)
  const bodyLength = params.body_length_mm
  const shoulderWidth = fp(params.shoulder_width_mm / 2)
  const neckWidth = fp(params.neck_width_mm / 2)
  const neckDropBack = fp(params.neck_width_mm * 0.15) // back neck drop ~15% of neck width (shallower)
  const armholeDepth = fp(bodyLength * 0.3)

  const entities: GeometryEntity[] = []

  // Main outline
  const outline: Point[] = [
    { x: fp(0), y: fp(0) },
    { x: fp(neckWidth), y: fp(0) },
    { x: fp(shoulderWidth), y: fp(-sa) },
    { x: fp(halfChest), y: fp(armholeDepth) },
    { x: fp(halfChest), y: fp(bodyLength) },
    { x: fp(0), y: fp(bodyLength) },
  ]
  entities.push({ type: 'polyline', points: outline, closed: true })

  // Back neckline (always crew-like, shallower)
  entities.push({
    type: 'arc',
    center: { x: fp(neckWidth / 2), y: fp(0) },
    radius: fp(neckWidth / 2),
    startAngle: 200,
    endAngle: 340,
  })

  // Seam allowance
  const saOutline: Point[] = [
    { x: fp(-sa), y: fp(-sa) },
    { x: fp(neckWidth + sa), y: fp(-sa) },
    { x: fp(shoulderWidth + sa), y: fp(-sa * 2) },
    { x: fp(halfChest + sa), y: fp(armholeDepth) },
    { x: fp(halfChest + sa), y: fp(bodyLength + sa) },
    { x: fp(-sa), y: fp(bodyLength + sa) },
  ]
  entities.push({ type: 'polyline', points: saOutline, closed: true })

  // Grainline
  entities.push({
    type: 'grainline',
    start: { x: fp(halfChest * 0.3), y: fp(bodyLength * 0.2) },
    end: { x: fp(halfChest * 0.3), y: fp(bodyLength * 0.8) },
  })

  // Notches
  entities.push({ type: 'notch', position: { x: fp(shoulderWidth / 2), y: fp(-sa / 2) }, angle: 90, length: 8 })
  entities.push({ type: 'notch', position: { x: fp(halfChest), y: fp(armholeDepth / 2) }, angle: 0, length: 8 })

  // Label
  entities.push({
    type: 'text',
    position: { x: fp(halfChest * 0.3), y: fp(bodyLength * 0.5) },
    content: 'BACK',
    height: 12,
  })

  // Indicate back neck drop
  void neckDropBack

  return {
    name: 'Back Bodice',
    entities,
    boundingBox: computeBoundingBox(entities),
  }
}

function generateSleeve(params: TshirtParams): PatternPiece {
  const sa = params.seam_allowance_mm
  const sleeveLength = params.sleeve_type === 'long' ? params.sleeve_length_mm : fp(params.sleeve_length_mm * 0.45)
  const armholeDepth = fp(params.body_length_mm * 0.3)
  const sleeveWidth = fp(armholeDepth * 1.3) // sleeve width based on armhole
  const capHeight = fp(armholeDepth * 0.45)

  const entities: GeometryEntity[] = []

  // Sleeve outline with cap curve approximated as polyline
  const outline: Point[] = [
    { x: fp(0), y: fp(capHeight) },                             // underarm left
    { x: fp(sleeveWidth * 0.15), y: fp(capHeight * 0.3) },      // cap curve left
    { x: fp(sleeveWidth / 2), y: fp(0) },                       // cap top center
    { x: fp(sleeveWidth * 0.85), y: fp(capHeight * 0.3) },      // cap curve right
    { x: fp(sleeveWidth), y: fp(capHeight) },                   // underarm right
    { x: fp(sleeveWidth), y: fp(capHeight + sleeveLength) },    // hem right
    { x: fp(0), y: fp(capHeight + sleeveLength) },              // hem left
  ]
  entities.push({ type: 'polyline', points: outline, closed: true })

  // Seam allowance
  const saOutline: Point[] = [
    { x: fp(-sa), y: fp(capHeight + sa) },
    { x: fp(sleeveWidth * 0.15 - sa), y: fp(capHeight * 0.3 - sa) },
    { x: fp(sleeveWidth / 2), y: fp(-sa) },
    { x: fp(sleeveWidth * 0.85 + sa), y: fp(capHeight * 0.3 - sa) },
    { x: fp(sleeveWidth + sa), y: fp(capHeight + sa) },
    { x: fp(sleeveWidth + sa), y: fp(capHeight + sleeveLength + sa) },
    { x: fp(-sa), y: fp(capHeight + sleeveLength + sa) },
  ]
  entities.push({ type: 'polyline', points: saOutline, closed: true })

  // Grainline
  entities.push({
    type: 'grainline',
    start: { x: fp(sleeveWidth / 2), y: fp(capHeight * 1.2) },
    end: { x: fp(sleeveWidth / 2), y: fp(capHeight + sleeveLength * 0.8) },
  })

  // Notches: cap center and underarm
  entities.push({ type: 'notch', position: { x: fp(sleeveWidth / 2), y: fp(0) }, angle: 90, length: 8 })
  entities.push({ type: 'notch', position: { x: fp(0), y: fp(capHeight) }, angle: 0, length: 8 })
  entities.push({ type: 'notch', position: { x: fp(sleeveWidth), y: fp(capHeight) }, angle: 180, length: 8 })

  // Label
  entities.push({
    type: 'text',
    position: { x: fp(sleeveWidth * 0.3), y: fp(capHeight + sleeveLength * 0.4) },
    content: 'SLEEVE',
    height: 12,
  })

  return {
    name: 'Sleeve',
    entities,
    boundingBox: computeBoundingBox(entities),
  }
}

function generateNeckband(params: TshirtParams): PatternPiece {
  const sa = params.seam_allowance_mm
  const neckCircumference = fp(params.neck_width_mm * Math.PI * 0.95) // slightly smaller for stretch
  const bandWidth = 30 // standard neckband width in mm

  const entities: GeometryEntity[] = []

  // Main rectangle
  const outline: Point[] = [
    { x: fp(0), y: fp(0) },
    { x: fp(neckCircumference), y: fp(0) },
    { x: fp(neckCircumference), y: fp(bandWidth) },
    { x: fp(0), y: fp(bandWidth) },
  ]
  entities.push({ type: 'polyline', points: outline, closed: true })

  // Seam allowance rectangle
  const saOutline: Point[] = [
    { x: fp(-sa), y: fp(-sa) },
    { x: fp(neckCircumference + sa), y: fp(-sa) },
    { x: fp(neckCircumference + sa), y: fp(bandWidth + sa) },
    { x: fp(-sa), y: fp(bandWidth + sa) },
  ]
  entities.push({ type: 'polyline', points: saOutline, closed: true })

  // Fold line (dashed center)
  entities.push({
    type: 'line',
    start: { x: fp(0), y: fp(bandWidth / 2) },
    end: { x: fp(neckCircumference), y: fp(bandWidth / 2) },
  })

  // Grainline
  entities.push({
    type: 'grainline',
    start: { x: fp(neckCircumference * 0.2), y: fp(bandWidth * 0.25) },
    end: { x: fp(neckCircumference * 0.8), y: fp(bandWidth * 0.25) },
  })

  // Label
  entities.push({
    type: 'text',
    position: { x: fp(neckCircumference * 0.35), y: fp(bandWidth * 0.7) },
    content: 'NECKBAND',
    height: 8,
  })

  return {
    name: 'Neckband',
    entities,
    boundingBox: computeBoundingBox(entities),
  }
}

export function generateTshirtPattern(params: TshirtParams): PatternPiece[] {
  return [
    generateFrontBodice(params),
    generateBackBodice(params),
    generateSleeve(params),
    generateNeckband(params),
  ]
}

import type { PatternIR } from './types'

interface BomLine {
  item: string
  description: string
  quantity: number
  unit: string
  notes: string
}

interface Bom {
  template_type: 'tshirt'
  schema_version: 2
  size_label: string
  version: number
  generated_at: string
  fabric_body_area_sqmm: number
  fabric_body_yardage_estimate: string
  fabric_neckband_area_sqmm: number
  fabric_neckband_yardage_estimate: string
  lines: BomLine[]
}

// Convert mm² to fabric yards (approximate: 1 yard = 914mm × 1500mm typical fabric width)
function sqmmToYards(sqmm: number, wasteMultiplier = 1.15, fabricWidthMm = 1500): string {
  const withWaste = sqmm * wasteMultiplier
  const yards = withWaste / (914 * fabricWidthMm)
  return yards.toFixed(2)
}

export function generateBom(ir: PatternIR): Bom {
  const { params } = ir
  const version = ir.pieces[0]?.labels.version ?? 1

  // Compute body fabric area from front, back, sleeve pieces
  const bodyPieceNames = ['Front Bodice', 'Back Bodice', 'Sleeve']
  let bodyAreaSqmm = 0
  for (const piece of ir.pieces) {
    if (bodyPieceNames.includes(piece.name)) {
      const bb = piece.bounding_box
      const pieceArea = (bb.maxX - bb.minX) * (bb.maxY - bb.minY)
      bodyAreaSqmm += pieceArea * piece.cut_quantity
    }
  }

  const neckbandPiece = ir.pieces.find(p => p.name === 'Neckband')
  let neckbandAreaSqmm = 0
  if (neckbandPiece) {
    const nb = neckbandPiece.bounding_box
    neckbandAreaSqmm = (nb.maxX - nb.minX) * (nb.maxY - nb.minY)
  }

  const pocketPiece = ir.pieces.find(p => p.name === 'Pocket')
  let pocketAreaSqmm = 0
  if (pocketPiece) {
    const pb = pocketPiece.bounding_box
    pocketAreaSqmm = (pb.maxX - pb.minX) * (pb.maxY - pb.minY)
  }

  const lines: BomLine[] = [
    {
      item: 'FABRIC-BODY',
      description: `Knit jersey body fabric (${params.fabric_stretch_class} stretch)`,
      quantity: parseFloat(sqmmToYards(bodyAreaSqmm + pocketAreaSqmm)),
      unit: 'yards',
      notes: `Based on ${params.chest_finished_circumference_mm}mm chest, ${params.body_length_hps_to_hem_mm}mm length. Includes 15% waste factor.`,
    },
    {
      item: 'FABRIC-NECKBAND',
      description: 'Knit rib or jersey neckband fabric',
      quantity: parseFloat(sqmmToYards(neckbandAreaSqmm, 1.2, 600)),
      unit: 'yards',
      notes: `Neckband ${params.neckband_finished_width_mm}mm finished width. Includes 20% waste.`,
    },
    {
      item: 'TRIM-CARE-LABEL',
      description: 'Care and content label',
      quantity: 1,
      unit: 'pcs',
      notes: 'Placeholder — specify label dimensions',
    },
    {
      item: 'TRIM-BRAND-LABEL',
      description: 'Brand label (neck)',
      quantity: 1,
      unit: 'pcs',
      notes: 'Placeholder — specify label dimensions',
    },
    {
      item: 'TRIM-SIZE-LABEL',
      description: `Size label (${params.size_label})`,
      quantity: 1,
      unit: 'pcs',
      notes: 'Placeholder',
    },
    {
      item: 'TRIM-HANG-TAG',
      description: 'Hang tag with cord',
      quantity: 1,
      unit: 'pcs',
      notes: 'Placeholder',
    },
    {
      item: 'THREAD-MAIN',
      description: 'Overlock thread (main seams)',
      quantity: 1,
      unit: 'set (4 cones)',
      notes: 'Color match to fabric body',
    },
    {
      item: 'THREAD-COVERSTITCH',
      description: 'Coverstitch thread (hem)',
      quantity: 1,
      unit: 'set (3 cones)',
      notes: 'Color match to fabric body',
    },
  ]

  if (params.pocket_enabled && params.pocket_width_mm && params.pocket_height_mm) {
    lines.splice(2, 0, {
      item: 'FABRIC-POCKET',
      description: 'Pocket fabric (may be same as body or contrast)',
      quantity: parseFloat(sqmmToYards(pocketAreaSqmm, 1.3, 600)),
      unit: 'yards',
      notes: `Pocket size: ${params.pocket_width_mm}×${params.pocket_height_mm}mm`,
    })
  }

  return {
    template_type: 'tshirt',
    schema_version: 2,
    size_label: params.size_label,
    version,
    generated_at: new Date().toISOString(),
    fabric_body_area_sqmm: Math.round(bodyAreaSqmm),
    fabric_body_yardage_estimate: sqmmToYards(bodyAreaSqmm + pocketAreaSqmm),
    fabric_neckband_area_sqmm: Math.round(neckbandAreaSqmm),
    fabric_neckband_yardage_estimate: sqmmToYards(neckbandAreaSqmm, 1.2, 600),
    lines,
  }
}

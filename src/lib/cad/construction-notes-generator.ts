import type { PatternIR } from './types'

interface ConstructionNotes {
  template_type: 'tshirt'
  schema_version: 2
  size_label: string
  version: number
  generated_at: string
  fabric_assumption: string
  seam_type: string
  seam_allowance_note: string
  neckband_finish: string
  hem_finish_body: string
  hem_finish_sleeve: string
  sleeve_attachment: string
  pocket_construction?: string
  stitch_types: {
    main_seams: string
    neckband_attachment: string
    hem_body: string
    hem_sleeve: string
  }
  press_instructions: string
  notch_reference: string
}

export function generateConstructionNotes(ir: PatternIR): ConstructionNotes {
  const { params, derived } = ir
  const version = ir.pieces[0]?.labels.version ?? 1
  const nrPct = Math.round(derived.neckband_length_ratio * 100)

  const notes: ConstructionNotes = {
    template_type: 'tshirt',
    schema_version: 2,
    size_label: params.size_label,
    version,
    generated_at: new Date().toISOString(),
    fabric_assumption: `Knit jersey body (${params.fabric_stretch_class} stretch). Knit rib or jersey neckband.`,
    seam_type: `4-thread overlock (serger). Seam allowance: ${params.seam_allowance_mm}mm.`,
    seam_allowance_note: `All seam allowances are ${params.seam_allowance_mm}mm unless indicated on pattern piece.`,
    neckband_finish: `Fold neckband in half lengthwise (fold line marked on pattern). Attach to neckline at ${nrPct}% of neckline perimeter using a 4-thread overlock. Stretch neckband to fit neckline. Align center front notch (N8) to center front seam.`,
    hem_finish_body: `Single fold hem. Turn up ${params.hem_allowance_body_mm}mm on body hem and sleeve. Stitch with twin-needle coverstitch.`,
    hem_finish_sleeve: `Single fold hem. Turn up ${params.hem_allowance_sleeve_mm}mm on sleeve opening. Stitch with twin-needle coverstitch.`,
    sleeve_attachment: `Set-in sleeve. Match sleeve cap front notch (N5) to front armhole notch (N1). Match sleeve cap back notch (N6) to back armhole notch (N3). Ease sleeve cap into armhole. Sew with 4-thread overlock pressing toward sleeve.`,
    stitch_types: {
      main_seams: '4-thread overlock, SPI 12',
      neckband_attachment: '4-thread overlock with stretch, SPI 14',
      hem_body: 'Twin-needle coverstitch, SPI 14',
      hem_sleeve: 'Twin-needle coverstitch, SPI 14',
    },
    press_instructions: `Press all seams toward back. Press neckband seam allowance toward body. Do not press neckband fold — neckband should stand naturally.`,
    notch_reference: 'N1=Front armhole, N2=Front side seam, N3=Back armhole, N4=Back side seam, N5=Sleeve cap front, N6=Sleeve cap back, N7=Sleeve underarm midpoint, N8=Neckband CF',
  }

  if (params.pocket_enabled && params.pocket_width_mm && params.pocket_height_mm) {
    notes.pocket_construction =
      `Single welt patch pocket. Pocket size: ${params.pocket_width_mm}×${params.pocket_height_mm}mm. ` +
      `Placement: ${params.pocket_placement_from_cf_mm ?? '—'}mm from CF, ${params.pocket_placement_from_shoulder_mm ?? '—'}mm from shoulder. ` +
      `Finish top edge: fold over ${params.seam_allowance_mm}mm, stitch with single needle. ` +
      `Topstitch remaining three sides to front bodice with ${params.seam_allowance_mm}mm topstitch.` +
      (params.pocket_corner_radius_mm && params.pocket_corner_radius_mm > 0
        ? ` Corner radius: ${params.pocket_corner_radius_mm}mm.`
        : '')
  }

  return notes
}

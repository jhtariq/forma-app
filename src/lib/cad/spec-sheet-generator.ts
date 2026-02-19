import type { PatternIR } from './types'

interface PointOfMeasure {
  label: string
  nominal_mm: number
  tolerance_plus_mm: number
  tolerance_minus_mm: number
}

interface SpecSheet {
  template_type: 'tshirt'
  schema_version: 2
  size_label: string
  fit_profile: string
  units: 'mm'
  generated_at: string
  version: number
  points_of_measure: PointOfMeasure[]
  neckband_stretch_note: string
  construction_reference: string
}

export function generateSpecSheet(ir: PatternIR): SpecSheet {
  const { params } = ir
  const version = ir.pieces[0]?.labels.version ?? 1

  const pom: PointOfMeasure[] = [
    {
      label: 'Chest Finished Circumference',
      nominal_mm: params.chest_finished_circumference_mm,
      tolerance_plus_mm: 10,
      tolerance_minus_mm: 10,
    },
    {
      label: 'Body Length (HPS to Hem)',
      nominal_mm: params.body_length_hps_to_hem_mm,
      tolerance_plus_mm: 5,
      tolerance_minus_mm: 5,
    },
    {
      label: 'Shoulder Width',
      nominal_mm: params.shoulder_width_mm,
      tolerance_plus_mm: 5,
      tolerance_minus_mm: 5,
    },
    {
      label: 'Hem Sweep Width',
      nominal_mm: params.hem_sweep_width_mm,
      tolerance_plus_mm: 10,
      tolerance_minus_mm: 10,
    },
    {
      label: 'Sleeve Length',
      nominal_mm: params.sleeve_length_mm,
      tolerance_plus_mm: 5,
      tolerance_minus_mm: 5,
    },
    {
      label: 'Bicep Width (1/2)',
      nominal_mm: params.bicep_width_mm / 2,
      tolerance_plus_mm: 8,
      tolerance_minus_mm: 8,
    },
    {
      label: 'Sleeve Opening Width (1/2)',
      nominal_mm: params.sleeve_opening_width_mm / 2,
      tolerance_plus_mm: 5,
      tolerance_minus_mm: 5,
    },
    {
      label: 'Neck Width',
      nominal_mm: params.neck_width_mm,
      tolerance_plus_mm: 3,
      tolerance_minus_mm: 3,
    },
    {
      label: 'Neck Depth Front',
      nominal_mm: params.neck_depth_front_mm,
      tolerance_plus_mm: 3,
      tolerance_minus_mm: 3,
    },
    {
      label: 'Neck Depth Back',
      nominal_mm: params.neck_depth_back_mm,
      tolerance_plus_mm: 2,
      tolerance_minus_mm: 2,
    },
    {
      label: 'Neckband Finished Width',
      nominal_mm: params.neckband_finished_width_mm,
      tolerance_plus_mm: 2,
      tolerance_minus_mm: 2,
    },
  ]

  if (params.pocket_enabled && params.pocket_width_mm && params.pocket_height_mm) {
    pom.push(
      {
        label: 'Pocket Width',
        nominal_mm: params.pocket_width_mm,
        tolerance_plus_mm: 3,
        tolerance_minus_mm: 3,
      },
      {
        label: 'Pocket Height',
        nominal_mm: params.pocket_height_mm,
        tolerance_plus_mm: 3,
        tolerance_minus_mm: 3,
      }
    )
  }

  const stretchNotes: Record<string, string> = {
    low: 'Low stretch fabric (< 20% stretch). Neckband cut at 92% of neckline perimeter.',
    medium: 'Medium stretch fabric (20–50% stretch). Neckband cut at 85% of neckline perimeter.',
    high: 'High stretch fabric (> 50% stretch). Neckband cut at 75% of neckline perimeter.',
  }

  return {
    template_type: 'tshirt',
    schema_version: 2,
    size_label: params.size_label,
    fit_profile: params.fit_profile,
    units: 'mm',
    generated_at: new Date().toISOString(),
    version,
    points_of_measure: pom,
    neckband_stretch_note: stretchNotes[params.fabric_stretch_class] ?? '',
    construction_reference: 'See construction_notes.json for seam and finish details.',
  }
}

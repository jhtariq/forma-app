import type { TshirtParams } from './types'

const PARAM_LABELS: Partial<Record<keyof TshirtParams, string>> = {
  size_label: 'Size Label',
  fit_profile: 'Fit Profile',
  chest_finished_circumference_mm: 'Chest Circumference (mm)',
  body_length_hps_to_hem_mm: 'Body Length HPS→Hem (mm)',
  shoulder_width_mm: 'Shoulder Width (mm)',
  hem_sweep_width_mm: 'Hem Sweep Width (mm)',
  sleeve_type: 'Sleeve Type',
  sleeve_length_mm: 'Sleeve Length (mm)',
  bicep_width_mm: 'Bicep Width (mm)',
  sleeve_opening_width_mm: 'Sleeve Opening Width (mm)',
  drop_shoulder_mm: 'Drop Shoulder (mm)',
  neckline_type: 'Neckline Type',
  neck_width_mm: 'Neck Width (mm)',
  neck_depth_front_mm: 'Neck Depth Front (mm)',
  neck_depth_back_mm: 'Neck Depth Back (mm)',
  neckband_finished_width_mm: 'Neckband Width (mm)',
  fabric_stretch_class: 'Fabric Stretch Class',
  seam_allowance_mm: 'Seam Allowance (mm)',
  hem_allowance_body_mm: 'Hem Allowance Body (mm)',
  hem_allowance_sleeve_mm: 'Hem Allowance Sleeve (mm)',
  pocket_enabled: 'Pocket Enabled',
  pocket_width_mm: 'Pocket Width (mm)',
  pocket_height_mm: 'Pocket Height (mm)',
  pocket_placement_from_cf_mm: 'Pocket Placement from CF (mm)',
  pocket_placement_from_shoulder_mm: 'Pocket Placement from Shoulder (mm)',
  pocket_corner_radius_mm: 'Pocket Corner Radius (mm)',
  body_color_hex: 'Body Color',
  neckband_color_hex: 'Neckband Color',
  pocket_color_hex: 'Pocket Color',
}

export interface ParamDiff {
  key: string
  label: string
  oldValue: string | number | boolean | undefined
  newValue: string | number | boolean | undefined
}

export function computeParamDiff(oldParams: TshirtParams, newParams: TshirtParams): string {
  const changes: string[] = []
  const keys = Object.keys(PARAM_LABELS) as (keyof TshirtParams)[]

  for (const key of keys) {
    const oldVal = oldParams[key]
    const newVal = newParams[key]
    if (oldVal !== newVal) {
      const label = PARAM_LABELS[key] ?? key
      changes.push(`${label}: ${oldVal ?? 'unset'} → ${newVal ?? 'unset'}`)
    }
  }

  if (changes.length === 0) return 'No parameter changes'
  return changes.join(', ')
}

export function computeParamDiffStructured(
  oldParams: TshirtParams,
  newParams: TshirtParams
): ParamDiff[] {
  const diffs: ParamDiff[] = []
  const keys = Object.keys(PARAM_LABELS) as (keyof TshirtParams)[]

  for (const key of keys) {
    const oldVal = oldParams[key] as string | number | boolean | undefined
    const newVal = newParams[key] as string | number | boolean | undefined
    if (oldVal !== newVal) {
      diffs.push({
        key,
        label: PARAM_LABELS[key] ?? key,
        oldValue: oldVal,
        newValue: newVal,
      })
    }
  }

  return diffs
}

export function buildVersionDiffJson(
  oldParams: TshirtParams,
  newParams: TshirtParams,
  oldVersion: number,
  newVersion: number
): object {
  return {
    from_version: oldVersion,
    to_version: newVersion,
    generated_at: new Date().toISOString(),
    changes: computeParamDiffStructured(oldParams, newParams),
    summary: computeParamDiff(oldParams, newParams),
  }
}

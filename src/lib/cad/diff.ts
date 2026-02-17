import type { TshirtParams } from './types'

export function computeParamDiff(oldParams: TshirtParams, newParams: TshirtParams): string {
  const changes: string[] = []

  const keys: (keyof TshirtParams)[] = [
    'chest_circumference_mm',
    'shoulder_width_mm',
    'body_length_mm',
    'sleeve_length_mm',
    'neck_width_mm',
    'ease_mm',
    'seam_allowance_mm',
    'sleeve_type',
    'neckline_type',
  ]

  for (const key of keys) {
    const oldVal = oldParams[key]
    const newVal = newParams[key]

    if (oldVal !== newVal) {
      const label = key.replace(/_/g, ' ').replace(/\bmm\b/, '(mm)')
      changes.push(`${label}: ${oldVal ?? 'unset'} → ${newVal ?? 'unset'}`)
    }
  }

  if (changes.length === 0) {
    return 'No parameter changes'
  }

  return changes.join(', ')
}

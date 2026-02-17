import type { TshirtParams } from './types'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function validateTshirtParams(params: TshirtParams): ValidationResult {
  const errors: string[] = []

  // All dimensions must be positive
  const numericFields: { key: keyof TshirtParams; label: string }[] = [
    { key: 'chest_circumference_mm', label: 'Chest circumference' },
    { key: 'shoulder_width_mm', label: 'Shoulder width' },
    { key: 'body_length_mm', label: 'Body length' },
    { key: 'sleeve_length_mm', label: 'Sleeve length' },
    { key: 'neck_width_mm', label: 'Neck width' },
    { key: 'ease_mm', label: 'Ease' },
    { key: 'seam_allowance_mm', label: 'Seam allowance' },
  ]

  for (const field of numericFields) {
    const value = params[field.key]
    if (typeof value !== 'number' || isNaN(value as number)) {
      errors.push(`${field.label} must be a number`)
    } else if ((value as number) <= 0) {
      errors.push(`${field.label} must be positive`)
    }
  }

  // neck_width_mm must be less than shoulder_width_mm - 20
  if (params.neck_width_mm >= params.shoulder_width_mm - 20) {
    errors.push('Neck width must be less than shoulder width minus 20mm')
  }

  // seam_allowance_mm must be between 5 and 25
  if (params.seam_allowance_mm < 5 || params.seam_allowance_mm > 25) {
    errors.push('Seam allowance must be between 5mm and 25mm')
  }

  // ease_mm must be between 0 and 300
  if (params.ease_mm < 0 || params.ease_mm > 300) {
    errors.push('Ease must be between 0mm and 300mm')
  }

  // Validate optional enums
  if (params.sleeve_type && !['short', 'long'].includes(params.sleeve_type)) {
    errors.push('Sleeve type must be "short" or "long"')
  }

  if (params.neckline_type && !['crew', 'v'].includes(params.neckline_type)) {
    errors.push('Neckline type must be "crew" or "v"')
  }

  return { valid: errors.length === 0, errors }
}

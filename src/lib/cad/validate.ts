import type { TshirtParams } from './types'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function validateTshirtParams(params: TshirtParams): ValidationResult {
  const errors: string[] = []

  // ─── Positive-only numeric fields ─────────────────────────────────────────
  const positiveFields: Array<{ key: keyof TshirtParams; label: string }> = [
    { key: 'chest_finished_circumference_mm', label: 'Chest circumference' },
    { key: 'body_length_hps_to_hem_mm', label: 'Body length' },
    { key: 'shoulder_width_mm', label: 'Shoulder width' },
    { key: 'hem_sweep_width_mm', label: 'Hem sweep width' },
    { key: 'sleeve_length_mm', label: 'Sleeve length' },
    { key: 'bicep_width_mm', label: 'Bicep width' },
    { key: 'sleeve_opening_width_mm', label: 'Sleeve opening width' },
    { key: 'neck_width_mm', label: 'Neck width' },
    { key: 'neck_depth_front_mm', label: 'Neck depth front' },
    { key: 'neck_depth_back_mm', label: 'Neck depth back' },
    { key: 'neckband_finished_width_mm', label: 'Neckband width' },
    { key: 'seam_allowance_mm', label: 'Seam allowance' },
    { key: 'hem_allowance_body_mm', label: 'Hem allowance body' },
    { key: 'hem_allowance_sleeve_mm', label: 'Hem allowance sleeve' },
  ]
  for (const { key, label } of positiveFields) {
    const val = params[key]
    if (typeof val !== 'number' || isNaN(val as number)) {
      errors.push(`${label} must be a number`)
    } else if ((val as number) <= 0) {
      errors.push(`${label} must be greater than 0`)
    }
  }

  // drop_shoulder can be 0 but not negative
  if (typeof params.drop_shoulder_mm !== 'number' || isNaN(params.drop_shoulder_mm)) {
    errors.push('Drop shoulder must be a number')
  } else if (params.drop_shoulder_mm < 0 || params.drop_shoulder_mm > 80) {
    errors.push('Drop shoulder must be between 0 and 80mm')
  }

  // ─── Range checks ─────────────────────────────────────────────────────────
  if (
    typeof params.seam_allowance_mm === 'number' &&
    (params.seam_allowance_mm < 5 || params.seam_allowance_mm > 25)
  ) {
    errors.push('Seam allowance must be between 5mm and 25mm')
  }
  if (
    typeof params.hem_allowance_body_mm === 'number' &&
    (params.hem_allowance_body_mm < 10 || params.hem_allowance_body_mm > 40)
  ) {
    errors.push('Hem allowance body must be between 10mm and 40mm')
  }
  if (
    typeof params.hem_allowance_sleeve_mm === 'number' &&
    (params.hem_allowance_sleeve_mm < 10 || params.hem_allowance_sleeve_mm > 40)
  ) {
    errors.push('Hem allowance sleeve must be between 10mm and 40mm')
  }
  if (
    typeof params.neckband_finished_width_mm === 'number' &&
    (params.neckband_finished_width_mm < 10 || params.neckband_finished_width_mm > 60)
  ) {
    errors.push('Neckband width must be between 10mm and 60mm')
  }

  // ─── Structural constraints ───────────────────────────────────────────────
  if (params.neck_width_mm >= params.shoulder_width_mm - 20) {
    errors.push('Neck width must be less than shoulder width minus 20mm')
  }
  if (params.neck_depth_front_mm < params.neck_depth_back_mm) {
    errors.push('Neck depth front must be greater than or equal to neck depth back')
  }
  if (params.sleeve_opening_width_mm > params.bicep_width_mm) {
    errors.push('Sleeve opening width must be less than or equal to bicep width')
  }

  // ─── Enums ────────────────────────────────────────────────────────────────
  if (!params.size_label || params.size_label.trim() === '') {
    errors.push('Size label must not be empty')
  }
  if (!['slim', 'regular', 'relaxed', 'oversized'].includes(params.fit_profile)) {
    errors.push("Fit profile must be 'slim', 'regular', 'relaxed', or 'oversized'")
  }
  if (!['short', 'long'].includes(params.sleeve_type)) {
    errors.push("Sleeve type must be 'short' or 'long'")
  }
  if (!['crew', 'v'].includes(params.neckline_type)) {
    errors.push("Neckline type must be 'crew' or 'v'")
  }
  if (!['low', 'medium', 'high'].includes(params.fabric_stretch_class)) {
    errors.push("Fabric stretch class must be 'low', 'medium', or 'high'")
  }

  // ─── Color fields ─────────────────────────────────────────────────────────
  if (!params.body_color_hex || !params.body_color_hex.startsWith('#')) {
    errors.push('Body color must be a valid hex color (e.g. #F5F0E8)')
  }
  if (!params.neckband_color_hex || !params.neckband_color_hex.startsWith('#')) {
    errors.push('Neckband color must be a valid hex color (e.g. #1A1A1A)')
  }

  // ─── Pocket constraints (when enabled) ───────────────────────────────────
  if (params.pocket_enabled) {
    const pw = params.pocket_width_mm
    const ph = params.pocket_height_mm
    const pcf = params.pocket_placement_from_cf_mm
    const psh = params.pocket_placement_from_shoulder_mm
    const pcr = params.pocket_corner_radius_mm

    if (pw === undefined || pw === null) {
      errors.push('Pocket width is required when pocket is enabled')
    } else if (pw < 60 || pw > 180) {
      errors.push('Pocket width must be between 60mm and 180mm')
    }
    if (ph === undefined || ph === null) {
      errors.push('Pocket height is required when pocket is enabled')
    } else if (ph < 60 || ph > 180) {
      errors.push('Pocket height must be between 60mm and 180mm')
    }
    if (pcf === undefined || pcf === null) {
      errors.push('Pocket placement from CF is required when pocket is enabled')
    } else if (pcf < 0) {
      errors.push('Pocket placement from CF must be non-negative')
    }
    if (psh === undefined || psh === null) {
      errors.push('Pocket placement from shoulder is required when pocket is enabled')
    } else if (psh < 0) {
      errors.push('Pocket placement from shoulder must be non-negative')
    }
    if (pcr !== undefined && pcr !== null && (pcr < 0 || pcr > 40)) {
      errors.push('Pocket corner radius must be between 0mm and 40mm')
    }

    // Pocket must fit within front bodice sew area (20mm clearance)
    const clearance = 20
    if (typeof pw === 'number' && typeof pcf === 'number') {
      if (pcf + pw + clearance > params.chest_finished_circumference_mm / 2) {
        errors.push('Pocket placement + width exceeds front bodice width with clearance margin')
      }
    }
    if (typeof ph === 'number' && typeof psh === 'number') {
      const availableHeight =
        params.body_length_hps_to_hem_mm -
        params.neck_depth_front_mm -
        params.hem_allowance_body_mm -
        clearance
      if (psh + ph > availableHeight) {
        errors.push(
          'Pocket placement + height exceeds available front bodice sew area with clearance margin'
        )
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

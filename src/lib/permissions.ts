import type { UserRole } from '@/lib/types/database'

export function canCreateProject(role: UserRole): boolean {
  return role === 'admin' || role === 'member'
}

export function canUploadDocuments(role: UserRole): boolean {
  // External can upload if assigned to project (checked at query level)
  return role === 'admin' || role === 'member' || role === 'external'
}

export function canEditSpecBom(role: UserRole): boolean {
  return role === 'admin' || role === 'member'
}

export function canRequestApproval(role: UserRole): boolean {
  return role === 'admin' || role === 'member'
}

export function canApproveReject(role: UserRole, isAssignedApprover: boolean): boolean {
  if (role === 'admin') return true
  return isAssignedApprover && (role === 'member' || role === 'external')
}

export function canExport(role: UserRole): boolean {
  return role === 'admin' || role === 'member' || role === 'viewer'
}

export function canManuallySetStatus(role: UserRole): boolean {
  return role === 'admin' || role === 'member'
}

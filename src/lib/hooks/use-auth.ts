'use client'

import { createContext, useContext } from 'react'
import type { UserRole } from '@/lib/types/database'

export interface AppUser {
  id: string
  org_id: string
  email: string
  name: string
  role: UserRole
}

interface AuthContextType {
  user: AppUser | null
  loading: boolean
  signOut: () => Promise<void>
  switchUser: (email: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
  switchUser: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

'use client'

import { useEffect, useState, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthContext, type AppUser } from '@/lib/hooks/use-auth'

const DEMO_PASSWORD = 'demo1234'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const initializedRef = useRef(false)
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  // Listen for auth state changes — synchronous only, no async DB calls here
  // Supabase docs: don't make supabase client calls inside onAuthStateChange
  useEffect(() => {
    let mounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: any, session: any) => {
        if (!mounted) return
        initializedRef.current = true

        if (session?.user) {
          setSessionUserId(session.user.id)
        } else {
          setSessionUserId(null)
          setUser(null)
          setLoading(false)
        }
      }
    )

    // Safety timeout if onAuthStateChange never fires
    const timeout = setTimeout(() => {
      if (mounted && !initializedRef.current) {
        setLoading(false)
      }
    }, 3000)

    return () => {
      mounted = false
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [supabase])

  // Fetch app_user row when session user ID changes (separate from auth callback)
  useEffect(() => {
    if (!sessionUserId) return

    let cancelled = false

    const fetchAppUser = async () => {
      try {
        const { data } = await supabase
          .from('app_users')
          .select('*')
          .eq('id', sessionUserId)
          .single()

        if (data && !cancelled) {
          setUser(data)
        }
      } catch (err) {
        console.error('Failed to fetch app_user:', err)
      }
      if (!cancelled) setLoading(false)
    }

    fetchAppUser()

    return () => { cancelled = true }
  }, [sessionUserId, supabase])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    router.push('/login')
  }

  const switchUser = async (email: string) => {
    setLoading(true)
    setUser(null)
    await supabase.auth.signOut()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: DEMO_PASSWORD,
    })
    if (error) {
      console.error('Switch user failed:', error)
      setLoading(false)
      return
    }
    // onAuthStateChange SIGNED_IN will set sessionUserId,
    // which triggers the fetch effect to load the new app_user
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut, switchUser }}>
      {children}
    </AuthContext.Provider>
  )
}

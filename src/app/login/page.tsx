'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const DEMO_ACCOUNTS = [
  { email: 'admin@forma-demo.com', role: 'Admin', name: 'Alice Admin' },
  { email: 'member@forma-demo.com', role: 'Member', name: 'Mike Member' },
  { email: 'vendor@forma-demo.com', role: 'External', name: 'Vera Vendor' },
  { email: 'viewer@forma-demo.com', role: 'Viewer', name: 'Victor Viewer' },
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const { user: authUser, loading: authLoading } = useAuth()

  // If already logged in, redirect to projects
  useEffect(() => {
    if (!authLoading && authUser) {
      router.replace('/projects')
    }
  }, [authUser, authLoading, router])

  const handleLogin = async (loginEmail: string, loginPassword: string) => {
    setLoading(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // onAuthStateChange SIGNED_IN event will set the user,
    // and the useEffect above will redirect to /projects automatically.
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleLogin(email, password)
  }

  const handleDemoLogin = (demoEmail: string) => {
    handleLogin(demoEmail, 'demo1234')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-100">
            FORMA
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Manufacturing Source of Truth
          </p>
        </div>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-neutral-100">Sign in</CardTitle>
            <CardDescription className="text-neutral-400">
              Enter your credentials to access your workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-neutral-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-neutral-300">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-500"
                />
              </div>
              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-neutral-300">Quick Demo Login</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <Button
                key={account.email}
                variant="outline"
                size="sm"
                onClick={() => handleDemoLogin(account.email)}
                disabled={loading}
                className="border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
              >
                <span className="truncate">{account.name}</span>
                <span className="ml-1 text-xs text-neutral-500">({account.role})</span>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

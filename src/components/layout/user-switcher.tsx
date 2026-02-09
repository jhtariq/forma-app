'use client'

import { useAuth } from '@/lib/hooks/use-auth'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

const DEMO_USERS = [
  { email: 'admin@forma-demo.com', name: 'Alice Admin', role: 'admin' },
  { email: 'member@forma-demo.com', name: 'Mike Member', role: 'member' },
  { email: 'vendor@forma-demo.com', name: 'Vera Vendor', role: 'external' },
  { email: 'viewer@forma-demo.com', name: 'Victor Viewer', role: 'viewer' },
]

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-orange-600 text-white',
  member: 'bg-green-700 text-white',
  external: 'bg-blue-700 text-white',
  viewer: 'bg-neutral-600 text-white',
}

export function UserSwitcher() {
  const { user, switchUser, loading } = useAuth()

  if (!user) return null

  return (
    <Select
      value={user.email}
      onValueChange={(email) => switchUser(email)}
      disabled={loading}
    >
      <SelectTrigger className="w-[200px] bg-neutral-800 border-neutral-700 text-neutral-200 text-sm h-8">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-neutral-800 border-neutral-700">
        {DEMO_USERS.map((u) => (
          <SelectItem
            key={u.email}
            value={u.email}
            className="text-neutral-200 focus:bg-neutral-700 focus:text-neutral-100"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">{u.name}</span>
              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${ROLE_COLORS[u.role]}`}>
                {u.role}
              </Badge>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

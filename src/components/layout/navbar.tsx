'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/hooks/use-auth'
import { UserSwitcher } from './user-switcher'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { FolderOpen, LogOut, User } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Navbar() {
  const { user, signOut } = useAuth()
  const pathname = usePathname()

  if (!user) return null

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <nav className="h-14 border-b border-neutral-800 bg-neutral-950 px-4 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link
          href="/projects"
          className="text-lg font-bold tracking-tight text-orange-500"
        >
          FORMA
        </Link>

        <div className="flex items-center gap-1">
          <Link href="/projects">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800',
                pathname.startsWith('/projects') && 'text-neutral-100 bg-neutral-800/50'
              )}
            >
              <FolderOpen className="h-4 w-4 mr-1.5" />
              Projects
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="outline" className="text-[10px] text-neutral-500 border-neutral-700">
          DEMO
        </Badge>
        <UserSwitcher />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
            >
              <Avatar className="h-8 w-8 bg-orange-700">
                <AvatarFallback className="bg-orange-700 text-white text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-neutral-800 border-neutral-700 w-56"
          >
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium text-neutral-100">{user.name}</p>
              <p className="text-xs text-neutral-400">{user.email}</p>
              <Badge variant="secondary" className="mt-1 text-[10px] bg-neutral-700 text-neutral-300">
                {user.role}
              </Badge>
            </div>
            <DropdownMenuSeparator className="bg-neutral-700" />
            <DropdownMenuItem
              className="text-neutral-300 focus:bg-neutral-700 focus:text-neutral-100 cursor-pointer"
              disabled
            >
              <User className="h-4 w-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-neutral-700" />
            <DropdownMenuItem
              onClick={signOut}
              className="text-red-400 focus:bg-neutral-700 focus:text-red-300 cursor-pointer"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  )
}

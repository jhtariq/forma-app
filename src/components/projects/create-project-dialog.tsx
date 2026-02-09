'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/use-auth'
import { logAuditEvent } from '@/lib/audit'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [customer, setCustomer] = useState('')
  const [dueDate, setDueDate] = useState('')

  const handleCreate = async () => {
    if (!user || !name.trim()) return

    setLoading(true)

    try {
      // Get user's facility
      const { data: facilities } = await supabase
        .from('facilities')
        .select('id')
        .eq('org_id', user.org_id)
        .limit(1)

      const facilityId = facilities?.[0]?.id
      if (!facilityId) {
        toast.error('No facility found for your organization')
        setLoading(false)
        return
      }

      // Create project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          org_id: user.org_id,
          facility_id: facilityId,
          name: name.trim(),
          customer: customer.trim(),
          due_date: dueDate || null,
          status: 'Draft',
          created_by: user.id,
        })
        .select()
        .single()

      if (projectError) throw projectError

      // Create empty spec for this project
      const { error: specError } = await supabase
        .from('specs')
        .insert({ project_id: project.id })

      if (specError) throw specError

      // Create empty bom for this project
      const { error: bomError } = await supabase
        .from('boms')
        .insert({ project_id: project.id })

      if (bomError) throw bomError

      await queryClient.invalidateQueries({ queryKey: ['projects'] })

      toast.success('Project created successfully')
      onOpenChange(false)
      setName('')
      setCustomer('')
      setDueDate('')
      router.push(`/projects/${project.id}`)
    } catch (err) {
      console.error(err)
      toast.error('Failed to create project')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Create a new manufacturing project or order
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-neutral-300">Project Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spring 2026 Collection - Alpha"
              className="bg-neutral-800 border-neutral-700 text-neutral-100"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-neutral-300">Customer / Brand</Label>
            <Input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="bg-neutral-800 border-neutral-700 text-neutral-100"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-neutral-300">Due Date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-neutral-800 border-neutral-700 text-neutral-100"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-neutral-400 hover:text-neutral-100"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {loading ? 'Creating...' : 'Create Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

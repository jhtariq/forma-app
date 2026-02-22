'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DocumentsTab } from '@/components/tabs/documents-tab'
import { SpecTab } from '@/components/tabs/spec-tab'
import { BomTab } from '@/components/tabs/bom-tab'
import { CadTab } from '@/components/tabs/cad-tab'
import { ApprovalsTab } from '@/components/tabs/approvals-tab'
import { ExportTab } from '@/components/tabs/export-tab'
import { AuditTrailTab } from '@/components/tabs/audit-trail-tab'
import {
  FileText,
  ClipboardList,
  Table2,
  Ruler,
  CheckCircle2,
  Download,
  History,
} from 'lucide-react'

export function ProjectTabs({ projectId }: { projectId: string }) {
  return (
    <Tabs defaultValue="documents" className="space-y-4">
      <TabsList className="bg-neutral-900 border border-neutral-800 p-1 h-auto flex-wrap">
        <TabsTrigger
          value="documents"
          className="data-[state=active]:bg-neutral-700 data-[state=active]:text-neutral-100 text-neutral-400 text-sm"
        >
          <FileText className="h-4 w-4 mr-1.5" />
          Documents
        </TabsTrigger>
        <TabsTrigger
          value="spec"
          className="data-[state=active]:bg-neutral-700 data-[state=active]:text-neutral-100 text-neutral-400 text-sm"
        >
          <ClipboardList className="h-4 w-4 mr-1.5" />
          Spec
        </TabsTrigger>
        <TabsTrigger
          value="bom"
          className="data-[state=active]:bg-neutral-700 data-[state=active]:text-neutral-100 text-neutral-400 text-sm"
        >
          <Table2 className="h-4 w-4 mr-1.5" />
          BOM
        </TabsTrigger>
        <TabsTrigger
          value="cad"
          className="data-[state=active]:bg-neutral-700 data-[state=active]:text-neutral-100 text-neutral-400 text-sm"
        >
          <Ruler className="h-4 w-4 mr-1.5" />
          CAD
        </TabsTrigger>
        <TabsTrigger
          value="approvals"
          className="data-[state=active]:bg-neutral-700 data-[state=active]:text-neutral-100 text-neutral-400 text-sm"
        >
          <CheckCircle2 className="h-4 w-4 mr-1.5" />
          Approvals
        </TabsTrigger>
        <TabsTrigger
          value="export"
          className="data-[state=active]:bg-neutral-700 data-[state=active]:text-neutral-100 text-neutral-400 text-sm"
        >
          <Download className="h-4 w-4 mr-1.5" />
          Export
        </TabsTrigger>
        <TabsTrigger
          value="audit"
          className="data-[state=active]:bg-neutral-700 data-[state=active]:text-neutral-100 text-neutral-400 text-sm"
        >
          <History className="h-4 w-4 mr-1.5" />
          Audit Trail
        </TabsTrigger>
      </TabsList>

      <TabsContent value="documents">
        <DocumentsTab projectId={projectId} />
      </TabsContent>
      <TabsContent value="spec">
        <SpecTab projectId={projectId} />
      </TabsContent>
      <TabsContent value="bom">
        <BomTab projectId={projectId} />
      </TabsContent>
      <TabsContent value="cad">
        <CadTab projectId={projectId} />
      </TabsContent>
      <TabsContent value="approvals">
        <ApprovalsTab projectId={projectId} />
      </TabsContent>
      <TabsContent value="export">
        <ExportTab projectId={projectId} />
      </TabsContent>
      <TabsContent value="audit">
        <AuditTrailTab projectId={projectId} />
      </TabsContent>
    </Tabs>
  )
}

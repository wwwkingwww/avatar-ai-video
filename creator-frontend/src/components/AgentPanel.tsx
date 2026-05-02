import { useState } from 'react'
import { TEMPLATES, PLATFORMS, TEMPLATE_IDS, PLATFORM_IDS } from '@/services/videoConfig'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface AgentPanelProps {
  open: boolean
  onClose: () => void
  onSelectTemplate: (tpl: string) => void
  onSelectPlatform: (platform: string) => void
  selectedTemplate: string
  selectedPlatforms: string[]
}

export function AgentPanel({
  open, onClose,
  onSelectTemplate, onSelectPlatform,
  selectedTemplate, selectedPlatforms,
}: AgentPanelProps) {
  const [tab, setTab] = useState('templates')

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side="bottom" className="max-h-[55vh] rounded-t-xl" showCloseButton={false}>
        <SheetHeader className="flex-row items-center justify-between pb-2">
          <SheetTitle>模板 & 平台</SheetTitle>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>✕</Button>
        </SheetHeader>
        <Tabs value={tab} onValueChange={setTab} className="flex-1">
          <TabsList variant="default" className="w-full">
            <TabsTrigger value="templates">模板</TabsTrigger>
            <TabsTrigger value="platforms">平台</TabsTrigger>
          </TabsList>
          <TabsContent value="templates" className="mt-3">
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATE_IDS.map((id) => (
                <Button
                  key={id}
                  variant={selectedTemplate === id ? 'default' : 'outline'}
                  className="flex-col h-auto py-3 gap-1"
                  onClick={() => onSelectTemplate(id)}
                >
                  <span className="text-lg">{TEMPLATES[id].label.charAt(0)}{TEMPLATES[id].label.charAt(1)}</span>
                  <span className="text-xs font-semibold">{TEMPLATES[id].label}</span>
                  <span className="text-[10px] text-muted-foreground">{TEMPLATES[id].desc}</span>
                </Button>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="platforms" className="mt-3">
            <div className="grid grid-cols-2 gap-2">
              {PLATFORM_IDS.map((id) => (
                <Button
                  key={id}
                  variant={selectedPlatforms.includes(id) ? 'default' : 'outline'}
                  className="justify-between h-auto py-3"
                  onClick={() => onSelectPlatform(id)}
                >
                  <span>{PLATFORMS[id].icon} {PLATFORMS[id].label}</span>
                  <span className={selectedPlatforms.includes(id) ? 'text-primary-foreground' : 'text-muted-foreground'}>
                    {selectedPlatforms.includes(id) ? '✓' : ''}
                  </span>
                </Button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

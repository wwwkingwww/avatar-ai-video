import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface SchedulePickerProps {
  onSelect: (isoString: string | null) => void
  selected: string | null
}

export function SchedulePicker({ onSelect, selected }: SchedulePickerProps) {
  const [mode, setMode] = useState<'now' | 'later'>('now')

  const now = new Date()
  const defaultDate = new Date(now.getTime() + 3600000)
  const dateStr = defaultDate.toISOString().slice(0, 16)

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="text-sm font-semibold text-muted-foreground">发布时间</div>
        <div className="flex gap-2">
          <Button
            variant={mode === 'now' ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={() => { setMode('now'); onSelect(null) }}
          >
            ⚡ 立即发布
          </Button>
          <Button
            variant={mode === 'later' ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={() => setMode('later')}
          >
            🕐 定时发布
          </Button>
        </div>
        {mode === 'later' && (
          <Input
            type="datetime-local"
            defaultValue={dateStr}
            min={now.toISOString().slice(0, 16)}
            onChange={(e) => onSelect(new Date(e.target.value).toISOString())}
          />
        )}
        {selected && (
          <div className="text-sm text-primary text-center">
            将于 {new Date(selected).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 发布
          </div>
        )}
      </CardContent>
    </Card>
  )
}

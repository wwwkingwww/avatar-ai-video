import { useState, useCallback, KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TASK_TYPE_IDS, taskTypeInfo } from '../services/videoConfig'

interface ChatBarProps {
  onSend: (text: string) => void
  isStreaming: boolean
}

export function ChatBar({ onSend, isStreaming }: ChatBarProps) {
  const [text, setText] = useState('')

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed)
    setText('')
  }, [text, isStreaming, onSend])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSend()
  }, [handleSend])

  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-card/30 border-b border-border/20 shrink-0">
      <span className="font-display text-sm font-semibold italic text-primary whitespace-nowrap shrink-0 tracking-wide">
        创作
      </span>
      <div className="hidden lg:flex gap-1 shrink-0">
        {TASK_TYPE_IDS.map((id) => (
          <button
            key={id}
            onClick={() => onSend(taskTypeInfo(id).label)}
            disabled={isStreaming}
            className="px-2.5 py-1 rounded-full text-[10px] border border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors font-medium"
          >
            {taskTypeInfo(id).label}
          </button>
        ))}
      </div>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="描述你的视频创意..."
        disabled={isStreaming}
        className="flex-1 h-8 text-xs font-sans placeholder:text-muted-foreground/50"
      />
      <Button
        size="xs"
        onClick={handleSend}
        disabled={isStreaming || !text.trim()}
        className="shrink-0 whitespace-nowrap rounded-full px-3.5 text-xs font-semibold"
      >
        创建
      </Button>
      <Link
        to="/dashboard"
        className="hidden sm:inline-flex shrink-0 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border/20 hover:border-border/50"
      >
        后台
      </Link>
    </div>
  )
}

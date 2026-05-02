import { useState, useCallback, KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { QUICK_TAGS } from './ChatDialog'

interface ChatBarProps {
  onSend: (text: string) => void
  onExpand: () => void
  isStreaming: boolean
}

export function ChatBar({ onSend, onExpand, isStreaming }: ChatBarProps) {
  const [text, setText] = useState('')

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed)
    setText('')
  }, [text, isStreaming, onSend])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend()
    }
  }, [handleSend])

  return (
    <div className="flex items-center gap-2.5 px-5 py-2.5 bg-card border-b shrink-0">
      <span className="text-xs font-semibold text-primary whitespace-nowrap shrink-0">
        💬 AI 创作
      </span>
      <div className="hidden lg:flex gap-1 shrink-0">
        {QUICK_TAGS.slice(0, 4).map((tag) => (
          <button
            key={tag.label}
            onClick={() => onSend(tag.text)}
            disabled={isStreaming}
            className="px-2 py-0.5 rounded text-[10px] border text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
          >
            {tag.label}
          </button>
        ))}
      </div>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="描述你的视频创意，直接发送开始创作..."
        disabled={isStreaming}
        className="flex-1 h-8 text-xs"
      />
      <Button size="xs" onClick={handleSend} disabled={isStreaming || !text.trim()} className="shrink-0 whitespace-nowrap">
        ➤ 快速创建
      </Button>
      <Button variant="outline" size="xs" onClick={onExpand} className="shrink-0 whitespace-nowrap">
        ⛶ 展开对话
      </Button>
    </div>
  )
}

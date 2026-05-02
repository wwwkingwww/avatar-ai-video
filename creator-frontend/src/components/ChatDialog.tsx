import { useState, useRef, useCallback, KeyboardEvent, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { Message } from '../types'

interface ChatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  messages: Message[]
  streamingText: string
  isStreaming: boolean
  onSend: (text: string) => void
}

export function ChatDialog({ open, onOpenChange, messages, streamingText, isStreaming, onSend }: ChatDialogProps) {
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingText])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed)
    setText('')
  }, [text, isStreaming, onSend])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleOptionClick = useCallback((option: string) => {
    if (isStreaming) return
    onSend(option)
  }, [isStreaming, onSend])

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant')
  const currentOptions = lastAssistantMsg?.options || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[600px] h-[70vh] p-0 gap-0 flex flex-col"
        showCloseButton={false}
      >
        <DialogHeader className="flex-row items-center justify-between px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-sm">🎬 新建视频项目</DialogTitle>
          <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}>
            ✕
          </Button>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="flex gap-2.5">
              <Avatar size="sm">
                <AvatarFallback>AI</AvatarFallback>
              </Avatar>
              <div className="bg-muted rounded-xl px-3.5 py-2.5 max-w-[85%] text-sm leading-relaxed">
                你好！我是 AI 视频创作助手。你想做什么类型的作品？
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              <div className={cn('flex gap-2.5', msg.role === 'user' && 'flex-row-reverse')}>
                <Avatar size="sm">
                  <AvatarFallback className={msg.role === 'user' ? 'bg-primary text-primary-foreground' : ''}>
                    {msg.role === 'user' ? '我' : 'AI'}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    'rounded-xl px-3.5 py-2.5 max-w-[85%] text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted',
                  )}
                >
                  {msg.content}
                </div>
              </div>
              {msg.role === 'assistant' && msg.options && msg.options.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-2 ml-10">
                  {msg.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleOptionClick(opt)}
                      disabled={isStreaming}
                      className="px-2.5 py-1 rounded-md border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {isStreaming && streamingText && (
            <div className="flex gap-2.5">
              <Avatar size="sm">
                <AvatarFallback>AI</AvatarFallback>
              </Avatar>
              <div className="bg-muted rounded-xl px-3.5 py-2.5 max-w-[85%] text-sm leading-relaxed">
                {streamingText}
                <span className="inline-block w-2 h-4 bg-primary ml-0.5 align-text-bottom animate-pulse" />
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t shrink-0 space-y-2.5">
          {currentOptions.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {currentOptions.map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleOptionClick(opt)}
                  disabled={isStreaming}
                  className="px-2.5 py-1 rounded-md border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入文字或点击上方按钮快速选择..."
              rows={1}
              disabled={isStreaming}
              className="min-h-0 resize-none"
            />
            <Button size="sm" onClick={handleSend} disabled={isStreaming || !text.trim()}>
              发送
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

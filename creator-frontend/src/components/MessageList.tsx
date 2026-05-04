import { useEffect, useRef } from 'react'
import type { Message } from '../types'
import { Bubble } from './Bubble'

interface MessageListProps {
  messages: Message[]
  streamingText: string
  isStreaming: boolean
  onOptionSelect?: (option: string) => void
}

export function MessageList({ messages, streamingText, isStreaming, onOptionSelect }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <Bubble key={msg.id} message={msg} onOptionSelect={onOptionSelect} />
      ))}
      {isStreaming && streamingText && (
        <Bubble
          message={{ id: 'stream', role: 'assistant', content: streamingText, timestamp: Date.now() }}
          isStreaming
        />
      )}
      <div ref={endRef} />
    </div>
  )
}

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
  const prevMsgCountRef = useRef(messages.length)

  useEffect(() => {
    const newMsgAdded = messages.length > prevMsgCountRef.current
    prevMsgCountRef.current = messages.length
    endRef.current?.scrollIntoView({
      behavior: isStreaming || !newMsgAdded ? 'instant' : 'smooth',
      block: 'end',
    })
  }, [messages, streamingText, isStreaming])

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

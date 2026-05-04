import type { Message } from '../types'
import { QuickOptions } from './QuickOptions'

interface BubbleProps {
  message: Message
  isStreaming?: boolean
  onOptionSelect?: (option: string) => void
}

export function Bubble({ message, isStreaming, onOptionSelect }: BubbleProps) {
  const className = `bubble ${message.role}${isStreaming ? ' bubble-streaming' : ''}`
  return (
    <div className={className}>
      <div className="bubble-content">{message.content}</div>
      {message.options && message.options.length > 0 && (
        <QuickOptions options={message.options} mode={message.optionMode || 'single'} onSelect={onOptionSelect} />
      )}
    </div>
  )
}

import { useEffect, useRef } from 'react';
import type { Message } from '../types';
import { Bubble } from './Bubble';

interface MessageListProps {
  messages: Message[];
  streamingText: string;
  isStreaming: boolean;
}

export function MessageList({ messages, streamingText, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <Bubble key={msg.id} message={msg} />
      ))}
      {isStreaming && streamingText && (
        <Bubble
          message={{ id: 'streaming', role: 'assistant', content: streamingText, timestamp: Date.now() }}
          isStreaming
        />
      )}
      <div ref={bottomRef} />
    </div>
  );
}

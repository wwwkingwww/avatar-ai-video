import { useCallback } from 'react'
import { StepIndicator } from './StepIndicator'
import { PreviewPanel } from './PreviewPanel'
import { MessageList } from './MessageList'
import { InputArea } from './InputArea'
import { ProgressCard } from './ProgressCard'
import type { Message, UploadedFile } from '../types'

interface ChatViewProps {
  chatBar?: React.ReactNode
  step: number
  messages: Message[]
  streamingText: string
  isStreaming: boolean
  uploadedFiles: UploadedFile[]
  context: Record<string, unknown>
  taskId: string | null
  onSend: (text: string) => void
  onUpload: (file: File) => void
  onNewTask: () => void
}

export function ChatView({
  chatBar,
  step, messages, streamingText, isStreaming, uploadedFiles,
  context, taskId, onSend, onUpload, onNewTask,
}: ChatViewProps) {
  const handleRetry = useCallback(async () => {
    if (!taskId) return
    try { await fetch(`/api/tasks/${taskId}/retry`, { method: 'POST' }) }
    catch { /* ignore */ }
  }, [taskId])

  const intent = (context.intent as Record<string, unknown>) || {}
  const taskType = intent.taskType as string || null
  const platforms = (context.platforms as string[]) || []
  const script = intent.script as string || null

  const missing: string[] = []
  if (!taskType) missing.push('模板')
  if (platforms.length === 0) missing.push('平台')
  if (!intent.hasImage && !intent.hasVideo && !script && uploadedFiles.length === 0) missing.push('素材或文案')
  if (!script) missing.push('文案')

  const sidebarContent = step === 3 && taskId ? (
    <ProgressCard taskId={taskId} onNewTask={onNewTask} onRetry={handleRetry} />
  ) : (
    <>
      <PreviewPanel taskType={taskType} platforms={platforms} files={uploadedFiles} script={script} missing={missing} />
      <StepIndicator step={step} />
    </>
  )

  return (
    <div className="chat-view">
      <div className="chat-main">
        {chatBar}
        <div className="lg:hidden">{sidebarContent}</div>
        <MessageList messages={messages} streamingText={streamingText} isStreaming={isStreaming} onOptionSelect={onSend} />
        <InputArea onSend={onSend} onUpload={onUpload} uploadedFiles={uploadedFiles} disabled={isStreaming} />
      </div>
      <aside className="chat-sidebar">
        {sidebarContent}
      </aside>
    </div>
  )
}

import { useCallback } from 'react'
import { StepIndicator } from './StepIndicator'
import { PreviewPanel } from './PreviewPanel'
import { MessageList } from './MessageList'
import { InputArea } from './InputArea'
import { ProgressCard } from './ProgressCard'
import type { Message, UploadedFile } from '../types'

interface ChatViewProps {
  chatBar?: React.ReactNode
  compact?: boolean
  step: number
  messages: Message[]
  streamingText: string
  isStreaming: boolean
  uploadedFiles: UploadedFile[]
  context: Record<string, unknown>
  taskId: string | null
  sessionId: string | null
  status: string
  isSubmitting?: boolean
  onSend: (text: string) => void
  onUpload: (file: File) => void
  onNewTask: () => void
}

export function ChatView({
  chatBar,
  compact = false,
  step, messages, streamingText, isStreaming, uploadedFiles,
  context, taskId, sessionId, status, isSubmitting = false, onSend, onUpload, onNewTask,
}: ChatViewProps) {
  const handleRetry = useCallback(async () => {
    if (!sessionId) return
    try { await fetch(`/api/sessions/${sessionId}/retry`, { method: 'POST' }) }
    catch { /* ignore */ }
  }, [sessionId])

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
    <div className={compact ? 'chat-view-compact' : 'chat-view'}>
      <div className="chat-main">
        {chatBar}
        {!compact && <div className="lg:hidden">{sidebarContent}</div>}
        {compact && <div className="lg:hidden"><PreviewPanel taskType={taskType} platforms={platforms} files={uploadedFiles} script={script} missing={missing} /></div>}
        <MessageList messages={messages} streamingText={streamingText} isStreaming={isStreaming} onOptionSelect={onSend} />
        {step === 2 && status !== 'submitted' && status !== 'generating' && !isStreaming && (
          <div className="flex justify-center py-3 px-4">
            <button
              onClick={() => onSend('确认生成')}
              disabled={isSubmitting}
              className="px-8 py-2.5 rounded-full bg-gradient-to-r from-primary to-amber-500 text-background font-semibold text-sm shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.924 3.159 8.042l2.841-2.751z"></path>
                  </svg>
                  提交中…
                </span>
              ) : (
                '🎬 确认生成视频'
              )}
            </button>
          </div>
        )}
        <InputArea onSend={onSend} onUpload={onUpload} uploadedFiles={uploadedFiles} disabled={isStreaming} />
      </div>
      {!compact && (
        <aside className="chat-sidebar">
          {sidebarContent}
        </aside>
      )}
    </div>
  )
}

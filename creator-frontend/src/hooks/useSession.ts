import { useState, useCallback, useRef, useEffect } from 'react'
import type { Message, SessionState, UploadedFile, TaskResult } from '../types'
import { createSession, uploadFile, submitTask, getSessionStatus } from '../services/api'
import { parseOptions } from '../services/parseOptions'
import { useSSE } from './useSSE'

let msgIdCounter = 0
function nextId() { return `msg_${Date.now()}_${++msgIdCounter}` }

function formatErrorMessage(err: string): string {
  const errorMap: Record<string, string> = {
    '会话不存在或已过期': '❌ 会话已过期，请刷新页面重新开始',
    '操作不被允许（状态冲突）': '⚠️ 当前操作与任务状态冲突，请等待当前操作完成',
    '请求参数错误': '⚠️ 请求内容有误，请重试',
    'AI 服务不可用': '🤖 AI 暂时不可用，请稍后重试',
    '服务器内部错误': '💥 服务器遇到问题，请稍后重试',
    '服务暂时不可用': '🔧 服务正在维护中，请稍后再试',
    '请求超时，请重试': '⏰ 请求超时，请检查网络连接后重试',
    'Failed to fetch': '🌐 网络连接失败，请检查网络或代理设置',
    'NetworkError': '🌐 网络错误，请检查网络连接',
    '网络连接失败，请检查网络或后端服务是否正常运行': '🌐 网络连接失败，请检查网络或后端服务是否正常运行',
    'AbortError': '',
  }

  if (errorMap[err]) return errorMap[err]
  if (err.startsWith('HTTP')) return `❌ 服务器错误: ${err}`
  if (err.includes('网络连接失败')) return '🌐 网络连接失败，请检查网络或后端服务是否正常运行'

  return `❌ 错误: ${err}`
}

const initialState: SessionState = {
  sessionId: null, round: 0, status: 'chatting', messages: [], isStreaming: false,
}

export function useSession() {
  const [state, setState] = useState<SessionState>(initialState)
  const [streamingText, setStreamingText] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [context, setContext] = useState<Record<string, unknown>>({})
  const [taskId, setTaskId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSubmittingRef = useRef(false)
  const pendingAttachments = useRef<string[]>([])
  const pendingInit = useRef<Promise<string | null> | null>(null)
  const sse = useSSE()

  // 同步 isSubmitting state 到 ref
  useEffect(() => {
    isSubmittingRef.current = isSubmitting
  }, [isSubmitting])

  const initSession = useCallback(async () => {
    if (pendingInit.current) return pendingInit.current
    const promise = (async () => {
      setState(initialState); setStreamingText(''); setUploadedFiles([])
      setContext({}); setTaskId(null)
      try {
        const { sessionId, message } = await createSession()
        const parsed = parseOptions(message)
        const msg: Message = {
          id: nextId(), role: 'assistant', content: parsed.content,
          options: parsed.options.length > 0 ? parsed.options : undefined,
          optionMode: parsed.options.length > 0 ? parsed.optionMode : undefined,
          timestamp: Date.now(),
        }
        setState(prev => ({ ...prev, sessionId, round: 1, messages: [msg] }))
        return sessionId
      } catch (e) {
        const err = e instanceof Error ? e.message : '未知错误'
        setState(prev => ({ ...prev, messages: [...prev.messages, { id: nextId(), role: 'system', content: `连接失败: ${err}，请刷新页面重试`, timestamp: Date.now() }] }))
        return null
      }
    })()
    pendingInit.current = promise
    promise.finally(() => { pendingInit.current = null })
    return promise
  }, [])

  const ensureSession = useCallback(async () => {
    if (state.sessionId) return state.sessionId
    return initSession()
  }, [state.sessionId, initSession])

  const handleFileUpload = useCallback(async (file: File) => {
    const sid = await ensureSession()
    if (!sid) return
    try {
      const result = await uploadFile(sid, file)
      setUploadedFiles(prev => [...prev, result])
      pendingAttachments.current.push(result.url)
    } catch (e) {
      const err = e instanceof Error ? e.message : '上传失败'
      setState(prev => ({ ...prev, messages: [...prev.messages, { id: nextId(), role: 'system', content: `文件上传失败: ${err}`, timestamp: Date.now() }] }))
    }
  }, [ensureSession])

  const computeStep = useCallback((ctx: Record<string, unknown>, status: string, files: UploadedFile[]): number => {
    if (status === 'submitted') return 3
    const intent = (ctx.intent as Record<string, unknown>) || {}
    const filled = [
      !!intent.taskType,
      !!((ctx.platforms as string[])?.length),
      files.length > 0 || !!intent.hasImage || intent.taskType === 'text-to-video',
      !!intent.script,
    ].filter(Boolean).length
    return filled >= 3 ? 2 : 1
  }, [])

  const sendUserMessage = useCallback(async (content: string) => {
    const sid = await ensureSession()
    if (!sid) return

    // 如果是确认生成命令，强制重置 isStreaming 状态（防止之前的中断导致状态卡住）
    const isConfirmCommand = /^(✓\s*)?(确认生成|开始制作|提交|确认并生成视频)/.test(content.trim())
    if (isConfirmCommand) {
      console.log('[sendUserMessage] Confirm command detected, ensuring isStreaming is false');
      setState(prev => ({ ...prev, isStreaming: false }));
    } else if (state.isStreaming) {
      console.log('[sendUserMessage] Blocked: already streaming');
      return
    }

    const attachments = [...pendingAttachments.current]
    pendingAttachments.current = []

    if (isConfirmCommand) {
      // 使用 ref 防止重复提交（比 state 更及时）
      if (isSubmittingRef.current) {
        console.log('[sendUserMessage] Blocked: already submitting');
        return
      }
      isSubmittingRef.current = true
      setIsSubmitting(true)
      try {
        console.log('[sendUserMessage] Submitting task...');
        const result = await submitTask(sid, null, null)
        console.log('[sendUserMessage] Task submitted:', result.taskId);
        setTaskId(result.taskId)
        setState(prev => ({ ...prev, status: 'submitted' }))
      } catch (e) {
        const err = e instanceof Error ? e.message : '提交失败'
        console.error('[sendUserMessage] Submit failed:', err);
        if (/generating|生成中|已提交|submitted/.test(err)) {
          try {
            const statusResult = await getSessionStatus(sid)
            if (statusResult.taskId) {
              setTaskId(statusResult.taskId)
              setState(prev => ({ ...prev, status: 'submitted' }))
              setIsSubmitting(false)
              isSubmittingRef.current = false
              return
            }
          } catch { /* fall through to error display */ }
        }
        // 如果是 409 状态冲突，可能是已经提交过了，尝试获取最新状态
        if (/409|状态冲突/.test(err)) {
          try {
            const statusResult = await getSessionStatus(sid)
            if (statusResult.status === 'submitted' || statusResult.status === 'generating') {
              setTaskId(statusResult.taskId || '')
              setState(prev => ({ ...prev, status: statusResult.status as 'submitted' | 'generating' }))
              setIsSubmitting(false)
              isSubmittingRef.current = false
              return
            }
          } catch { /* fall through to error display */ }
        }
        setState(prev => ({ ...prev, status: 'chatting', messages: [...prev.messages, { id: nextId(), role: 'system', content: `❌ 提交失败: ${err}，请重试`, timestamp: Date.now() }] }))
      } finally {
        setIsSubmitting(false)
        isSubmittingRef.current = false
      }
      return
    }

    const userMsg: Message = { id: nextId(), role: 'user', content, timestamp: Date.now() }
    setState(prev => ({ ...prev, isStreaming: true, messages: [...prev.messages, userMsg] }))
    setStreamingText('')

    sse.connect(sid, content, attachments, {
      onChunk: (text) => { setStreamingText(prev => prev + text) },
      onDone: (info) => {
        setStreamingText(prev => {
          const parsed = parseOptions(prev || '')
          const ctx = (info.context || {}) as Record<string, unknown>
          setContext(ctx)
          const msg: Message = {
            id: nextId(), role: 'assistant', content: parsed.content,
            options: parsed.options.length > 0 ? parsed.options : undefined,
            optionMode: parsed.options.length > 0 ? parsed.optionMode : undefined,
            timestamp: Date.now(),
          }
          setState(s => ({ ...s, isStreaming: false, round: info.round, messages: [...s.messages, msg] }))
          return ''
        })
      },
      onError: (err) => {
        const friendlyError = formatErrorMessage(err)
        if (friendlyError) {
          setState(s => ({ ...s, isStreaming: false, messages: [...s.messages, { id: nextId(), role: 'system', content: friendlyError, timestamp: Date.now() }] }))
        } else {
          setState(s => ({ ...s, isStreaming: false }))
        }
        setStreamingText('')
      },
    })
  }, [state.sessionId, state.isStreaming, sse, ensureSession])

  const step = computeStep(context, state.status, uploadedFiles)

  return { step, state, streamingText, uploadedFiles, context, taskId, isSubmitting, initSession, ensureSession, sendUserMessage, handleFileUpload }
}

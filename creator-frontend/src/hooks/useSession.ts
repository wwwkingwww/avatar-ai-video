import { useState, useCallback, useRef } from 'react'
import type { Message, SessionState, UploadedFile, TaskResult } from '../types'
import { createSession, uploadFile, submitTask } from '../services/api'
import { parseOptions } from '../services/parseOptions'
import { useSSE } from './useSSE'

let msgIdCounter = 0
function nextId() { return `msg_${Date.now()}_${++msgIdCounter}` }

const initialState: SessionState = {
  sessionId: null, round: 0, status: 'chatting', messages: [], isStreaming: false,
}

export function useSession() {
  const [state, setState] = useState<SessionState>(initialState)
  const [streamingText, setStreamingText] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [context, setContext] = useState<Record<string, unknown>>({})
  const [taskId, setTaskId] = useState<string | null>(null)
  const pendingAttachments = useRef<string[]>([])
  const pendingInit = useRef<Promise<string> | null>(null)
  const sse = useSSE()

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
        setState(prev => ({ ...prev, messages: [...prev.messages, { id: nextId(), role: 'system', content: `连接失败: ${err}`, timestamp: Date.now() }] }))
        throw e
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
    if (!sid || state.isStreaming) return

    const attachments = [...pendingAttachments.current]
    pendingAttachments.current = []

    if (/^(✓\s*)?(确认生成|开始制作|提交|确认并生成视频)/.test(content.trim())) {
      setState(prev => ({ ...prev, status: 'submitted' }))
      try {
        const result = await submitTask(sid, null, null)
        setTaskId(result.taskId)
      } catch (e) {
        const err = e instanceof Error ? e.message : '提交失败'
        setState(prev => ({ ...prev, status: 'chatting', messages: [...prev.messages, { id: nextId(), role: 'system', content: `提交失败: ${err}`, timestamp: Date.now() }] }))
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
        setState(s => ({ ...s, isStreaming: false, messages: [...s.messages, { id: nextId(), role: 'system', content: `错误: ${err}`, timestamp: Date.now() }] }))
        setStreamingText('')
      },
    })
  }, [state, sse, ensureSession])

  const step = computeStep(context, state.status, uploadedFiles)

  return { step, state, streamingText, uploadedFiles, context, taskId, initSession, ensureSession, sendUserMessage, handleFileUpload }
}

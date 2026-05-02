import { useState, useCallback, useRef } from 'react';
import type { Message, SessionState, UploadedFile, TaskResult, ModelRecommendation } from '../types';
import { createSession, uploadFile, getConfirmData, submitTask, getCapabilities } from '../services/api';
import { stripOptions, buildOptions } from '../services/parseOptions';
import { TASK_TYPE_IDS, taskTypeInfo } from '../services/videoConfig';
import { useSSE } from './useSSE';

let msgIdCounter = 0;
function nextId() {
  return `msg_${Date.now()}_${++msgIdCounter}`;
}

const initialState: SessionState = {
  sessionId: null,
  round: 0,
  status: 'chatting',
  messages: [],
  forceConfirm: false,
  isStreaming: false,
};

export function useSession() {
  const [state, setState] = useState<SessionState>(initialState);
  const [streamingText, setStreamingText] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [recommendations, setRecommendations] = useState<ModelRecommendation[]>([]);
  const pendingAttachments = useRef<string[]>([]);
  const lastContext = useRef<Record<string, unknown>>({});
  const pendingInit = useRef<Promise<string> | null>(null);
  const sse = useSSE();

  function inferTag(content: string, ctx: Record<string, unknown>): string {
    const phase = (ctx.phase as string) || 'INTENT'
    if (phase === 'INTENT') {
      const match = TASK_TYPE_IDS.find(id => taskTypeInfo(id).label === content)
      if (match) return content
    }
    return content
  }

  const initSession = useCallback(async () => {
    if (pendingInit.current) {
      return pendingInit.current
    }

    const promise = (async () => {
      setState(initialState);
      setStreamingText('');
      setUploadedFiles([]);
      setRecommendations([]);
      try {
        const { sessionId, message, round } = await createSession();
        const content = stripOptions(message)
        const msg: Message = {
          id: nextId(), role: 'assistant' as const, content,
          options: buildOptions({ phase: 'INTENT' }, round, 4),
          timestamp: Date.now(),
        }
        setState((prev) => ({
          ...prev, sessionId, round,
          messages: [msg],
        }));
        return sessionId;
      } catch (e) {
        const msg = e instanceof Error ? e.message : '未知错误';
        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, { id: nextId(), role: 'system', content: `连接失败: ${msg}`, timestamp: Date.now() }],
        }));
        throw e;
      }
    })();

    pendingInit.current = promise;
    promise.finally(() => { pendingInit.current = null; });
    return promise;
  }, []);

  const ensureSession = useCallback(async () => {
    if (state.sessionId) return state.sessionId;
    return initSession();
  }, [state.sessionId, initSession]);

  const handleFileUpload = useCallback(async (file: File) => {
    const sid = await ensureSession();
    if (!sid) return;
    try {
      const result = await uploadFile(sid, file);
      setUploadedFiles((prev) => [...prev, result]);
      pendingAttachments.current.push(result.url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '上传失败';
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, { id: nextId(), role: 'system', content: `文件上传失败: ${msg}`, timestamp: Date.now() }],
      }));
    }
  }, [ensureSession]);

  const sendUserMessage = useCallback(async (content: string) => {
    const sid = await ensureSession();
    if (!sid) return;

    const currentState = state;
    if (currentState.isStreaming) return;

    const attachments = [...pendingAttachments.current];
    pendingAttachments.current = [];

    const taggedContent = inferTag(content, lastContext.current)

    const userMsg: Message = { id: nextId(), role: 'user', content: taggedContent, timestamp: Date.now() };
    setState((prev) => ({ ...prev, isStreaming: true, messages: [...prev.messages, userMsg] }));
    setStreamingText('');

    sse.connect(sid, taggedContent, attachments, {
      onChunk: (text) => { setStreamingText((prev) => prev + text); },
      onDone: async (info) => {
        setStreamingText((prev) => {
          const c = stripOptions(prev || '')
          const ctx = info.context || {}
          lastContext.current = ctx
          const options = buildOptions(ctx, info.round, 4)

          if (ctx.phase === 'RECOMMEND' || c.includes('推荐')) {
            getCapabilities().then(caps => {
              setRecommendations(caps.models.slice(0, 3))
            }).catch(() => {})
          }

          const msg: Message = {
            id: nextId(),
            role: 'assistant' as const,
            content: c,
            options: options.length > 0 ? options : undefined,
            timestamp: Date.now(),
          }
          setState((s) => ({
            ...s, isStreaming: false, round: info.round, forceConfirm: info.forceConfirm,
            messages: [...s.messages, msg],
            status: info.forceConfirm ? 'confirming' : 'chatting',
          }));
          return '';
        });
      },
      onError: (err) => {
        setState((s) => ({ ...s, isStreaming: false, messages: [...s.messages, { id: nextId(), role: 'system', content: `错误: ${err}`, timestamp: Date.now() }] }));
        setStreamingText('');
      },
    });
  }, [state, sse, ensureSession]);

  const backToChat = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'chatting' }));
  }, []);

  const goToConfirm = useCallback(async () => {
    const sid = await ensureSession();
    if (!sid) return;
    try {
      await getConfirmData(sid);
      setState((prev) => ({ ...prev, status: 'confirming' }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '获取确认数据失败';
      setState((prev) => ({ ...prev, messages: [...prev.messages, { id: nextId(), role: 'system', content: msg, timestamp: Date.now() }] }));
    }
  }, [ensureSession]);

  const handleSubmit = useCallback(async (scheduledAt?: string | null): Promise<TaskResult | null> => {
    const sid = await ensureSession();
    if (!sid) return null;
    try {
      const result = await submitTask(sid, scheduledAt);
      setState((prev) => ({ ...prev, status: 'submitted' }));
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '提交失败';
      setState((prev) => ({ ...prev, messages: [...prev.messages, { id: nextId(), role: 'system', content: `提交失败: ${msg}`, timestamp: Date.now() }] }));
      return null;
    }
  }, [ensureSession]);

  return { state, streamingText, uploadedFiles, recommendations, initSession, ensureSession, sendUserMessage, handleFileUpload, goToConfirm, handleSubmit, backToChat };
}

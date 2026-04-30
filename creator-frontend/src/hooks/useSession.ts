import { useState, useCallback, useRef } from 'react';
import type { Message, SessionState, UploadedFile, TaskResult } from '../types';
import { createSession, uploadFile, getConfirmData, submitTask } from '../services/api';
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
  const pendingAttachments = useRef<string[]>([]);
  const sse = useSSE();

  const initSession = useCallback(async () => {
    setState(initialState);
    setStreamingText('');
    setUploadedFiles([]);
    try {
      const { sessionId, message, round } = await createSession();
      setState((prev) => ({
        ...prev, sessionId, round,
        messages: [{ id: nextId(), role: 'assistant', content: message, timestamp: Date.now() }],
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误';
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, { id: nextId(), role: 'system', content: `连接失败: ${msg}`, timestamp: Date.now() }],
      }));
    }
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!state.sessionId) return;
    try {
      const result = await uploadFile(state.sessionId, file);
      setUploadedFiles((prev) => [...prev, result]);
      pendingAttachments.current.push(result.url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '上传失败';
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, { id: nextId(), role: 'system', content: `文件上传失败: ${msg}`, timestamp: Date.now() }],
      }));
    }
  }, [state.sessionId]);

  const sendUserMessage = useCallback((content: string) => {
    if (!state.sessionId || state.isStreaming) return;

    const attachments = [...pendingAttachments.current];
    pendingAttachments.current = [];

    const userMsg: Message = { id: nextId(), role: 'user', content: content || '已上传文件', timestamp: Date.now() };
    setState((prev) => ({ ...prev, isStreaming: true, messages: [...prev.messages, userMsg] }));
    setStreamingText('');

    sse.connect(state.sessionId, content, attachments, {
      onChunk: (text) => { setStreamingText((prev) => prev + text); },
      onDone: (info) => {
        setStreamingText((prev) => {
          setState((s) => ({
            ...s, isStreaming: false, round: info.round, forceConfirm: info.forceConfirm,
            messages: [...s.messages, { id: nextId(), role: 'assistant' as const, content: prev, timestamp: Date.now() }],
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
  }, [state.sessionId, state.isStreaming, sse]);

  const backToChat = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'chatting' }));
  }, []);

  const goToConfirm = useCallback(async () => {
    if (!state.sessionId) return;
    try {
      await getConfirmData(state.sessionId);
      setState((prev) => ({ ...prev, status: 'confirming' }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '获取确认数据失败';
      setState((prev) => ({ ...prev, messages: [...prev.messages, { id: nextId(), role: 'system', content: msg, timestamp: Date.now() }] }));
    }
  }, [state.sessionId]);

  const handleSubmit = useCallback(async (): Promise<TaskResult | null> => {
    if (!state.sessionId) return null;
    try {
      const result = await submitTask(state.sessionId);
      setState((prev) => ({ ...prev, status: 'submitted' }));
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '提交失败';
      setState((prev) => ({ ...prev, messages: [...prev.messages, { id: nextId(), role: 'system', content: `提交失败: ${msg}`, timestamp: Date.now() }] }));
      return null;
    }
  }, [state.sessionId]);

  return { state, streamingText, uploadedFiles, initSession, sendUserMessage, handleFileUpload, goToConfirm, handleSubmit, backToChat };
}

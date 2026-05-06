import type { TaskResult, TaskStatusInfo, UploadedFile, ModelRecommendation } from '../types';
import { debugLog, debugError } from '../lib/logger';

const BASE = '/api/sessions';

export async function createSession(): Promise<{ sessionId: string; message: string; round: number }> {
  const res = await fetch(BASE, { method: 'POST' });
  if (!res.ok) throw new Error('创建会话失败');
  return res.json();
}

export async function sendMessage(
  sessionId: string,
  content: string,
  attachments: string[],
  onChunk: (text: string) => void,
  onDone: (info: { round: number; forceConfirm: boolean; context?: Record<string, unknown> }) => void,
  onError: (err: string) => void,
): Promise<AbortController> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let hasError = false;

  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const handleError = (err: string) => {
    if (hasError) return;
    hasError = true;
    cleanup();
    onError(err);
  };

  timeoutId = setTimeout(() => {
    controller.abort();
    handleError('请求超时，请重试');
  }, 60000);

  debugLog('[sendMessage] Starting fetch request...');
  try {
    const res = await fetch(`/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, attachments }),
      signal: controller.signal,
    });
    cleanup();
    debugLog('[sendMessage] Response received:', res.status);
    if (!res.ok) {
      let errorDetails = ''
      try {
        const errData = await res.json()
        errorDetails = errData.error || errData.message || ''
      } catch { /* ignore parse error */ }

      const statusTexts: Record<number, string> = {
        400: '请求参数错误',
        401: '未授权',
        404: '会话不存在或已过期',
        409: '操作不被允许（状态冲突）',
        500: '服务器内部错误',
        502: 'AI 服务不可用',
        503: '服务暂时不可用',
      }

      const statusMsg = statusTexts[res.status] || `HTTP ${res.status}`
      const detailMsg = errorDetails ? `: ${errorDetails}` : ''

      handleError(`${statusMsg}${detailMsg}`)
      return controller;
    }

    const reader = res.body?.getReader();
    if (!reader) { handleError('流读取失败'); return controller; }

    const decoder = new TextDecoder();
    let buffer = '';
    let receivedDone = false;
    let chunkCount = 0;

    while (true) { // eslint-disable-line no-constant-condition
      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        const result = await reader.read();
        done = result.done;
        value = result.value;
      } catch (readErr: any) {
        debugError('[sendMessage] reader.read() error:', readErr?.name, readErr?.message);
        const msg = readErr?.message || String(readErr);
        if (msg.includes('ERR_ABORTED') || msg.includes('aborted')) {
          handleError('请求被中断，请重试');
        } else {
          handleError('读取响应失败，请重试');
        }
        return controller;
      }

      if (done) {
        debugLog('[sendMessage] Stream done. Chunks received:', chunkCount);
        if (!receivedDone) {
          if (buffer.trim()) {
            for (const line of buffer.split('\n')) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === 'done') {
                    onDone({ round: data.round, forceConfirm: data.forceConfirm, context: data.context || {} });
                    receivedDone = true;
                  } else if (data.type === 'error') {
                    handleError(data.content);
                    receivedDone = true;
                  }
                } catch { /* skip */ }
              }
            }
          }
          if (!receivedDone) {
            handleError('服务器响应异常，请重试');
          }
        }
        break;
      }

      chunkCount++;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'chunk') {
              onChunk(data.content);
            } else if (data.type === 'done') {
              receivedDone = true;
              onDone({ round: data.round, forceConfirm: data.forceConfirm, context: data.context || {} });
            } else if (data.type === 'error') {
              receivedDone = true;
              handleError(data.content);
            }
          } catch { /* skip */ }
        }
      }
    }
  } catch (e: any) {
    cleanup();
    const msg = (e && e.message) ? e.message : String(e);
    const errorStr = `${e.name || ''} ${msg}`;
    debugError('[sendMessage] fetch error:', e.name, msg);
    if (e.name === 'AbortError') {
      debugLog('[sendMessage] Request aborted by timeout or user');
      handleError('请求已取消');
    } else if (errorStr.includes('ERR_ABORTED')) {
      debugLog('[sendMessage] Request aborted by browser/network');
      handleError('请求被中断，请重试');
    } else {
      const isNetworkError = errorStr.includes('Failed to fetch') || errorStr.includes('NetworkError') || errorStr.includes('ERR_CONNECTION_REFUSED') || errorStr.includes('net::ERR') || errorStr.includes('fetch') || errorStr.includes('aborted');
      if (isNetworkError) {
        handleError('网络连接失败，请检查网络或后端服务是否正常运行');
      } else {
        handleError(msg);
      }
    }
  }

  return controller;
}

export async function uploadFile(sessionId: string, file: File): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BASE}/${sessionId}/upload`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error('上传失败');
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '上传失败');
  return { url: data.url, name: data.name, size: data.size };
}

export async function submitTask(sessionId: string, scheduledAt?: string | null, selectedModel?: unknown): Promise<TaskResult> {
  const res = await fetch(`${BASE}/${sessionId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduledAt: scheduledAt || null, selectedModel: selectedModel || null }),
  });
  if (!res.ok) {
    let errorDetails = ''
    try {
      const errData = await res.json()
      errorDetails = errData.error || errData.message || ''
    } catch { /* ignore */ }

    const statusTexts: Record<number, string> = {
      400: '请求参数错误',
      404: '任务或会话不存在',
      409: '操作不被允许（状态冲突）',
      500: '服务器内部错误',
      503: '服务暂时不可用',
    }

    const statusMsg = statusTexts[res.status] || `HTTP ${res.status}`
    throw new Error(errorDetails || `${statusMsg} (提交失败)`)
  }
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '提交失败');
  return {
    taskId: data.taskId,
    status: data.status || 'GENERATING',
    videoUrl: data.videoUrl || undefined,
    estimatedMinutes: data.estimatedMinutes || 20,
    jobId: data.jobId || undefined,
  };
}

export async function getSessionStatus(sessionId: string): Promise<{
  success: boolean; status: string; round: number; taskId: string | null
}> {
  const res = await fetch(`${BASE}/${sessionId}/status`);
  if (!res.ok) throw new Error('获取会话状态失败');
  return res.json();
}

export async function approvePublish(sessionId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${BASE}/${sessionId}/approve`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Approve publish failed' }));
    throw new Error(err.error || 'Approve publish failed');
  }
  return res.json();
}

export async function getCapabilities(taskType?: string): Promise<{
  taskTypes: string[];
  models: ModelRecommendation[];
}> {
  const url = taskType ? `/api/capabilities?taskType=${encodeURIComponent(taskType)}` : '/api/capabilities';
  const res = await fetch(url);
  if (!res.ok) throw new Error('获取能力列表失败');
  const data = await res.json();
  return { taskTypes: data.taskTypes || [], models: data.models || [] };
}

export async function getModelSchema(endpoint: string): Promise<ModelRecommendation> {
  const res = await fetch(`/api/capabilities/models/${encodeURIComponent(endpoint)}/schema`);
  if (!res.ok) throw new Error('获取模型参数失败');
  const data = await res.json();
  return data.schema;
}

export async function getTaskStatus(taskId: string): Promise<TaskStatusInfo> {
  const res = await fetch(`/api/tasks/${taskId}`);
  if (!res.ok) throw new Error('获取任务状态失败');
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '获取任务状态失败');
  return data.data;
}

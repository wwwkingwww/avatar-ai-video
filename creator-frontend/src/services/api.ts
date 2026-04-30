import type { ConfirmData, TaskResult, UploadedFile } from '../types';

const BASE = '/api/sessions';

export async function createSession(): Promise<{ sessionId: string; message: string; round: number }> {
  const res = await fetch(BASE, { method: 'POST' });
  if (!res.ok) throw new Error('创建会话失败');
  return res.json();
}

export function sendMessage(
  sessionId: string,
  content: string,
  attachments: string[],
  onChunk: (text: string) => void,
  onDone: (info: { round: number; forceConfirm: boolean }) => void,
  onError: (err: string) => void
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE}/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, attachments }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '请求失败' }));
        onError(err.error || '请求失败');
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { onError('流读取失败'); return; }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

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
                onDone({ round: data.round, forceConfirm: data.forceConfirm });
              } else if (data.type === 'error') {
                onError(data.content);
              }
            } catch { /* skip */ }
          }
        }
      }
    })
    .catch((e) => {
      if (e.name !== 'AbortError') {
        onError(e.message);
      }
    });

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

export async function getConfirmData(sessionId: string): Promise<ConfirmData> {
  const res = await fetch(`${BASE}/${sessionId}/confirm`);
  if (!res.ok) throw new Error('获取确认数据失败');
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return { items: data.items, missing: data.missing };
}

export async function submitTask(sessionId: string): Promise<TaskResult> {
  const res = await fetch(`${BASE}/${sessionId}/submit`, { method: 'POST' });
  if (!res.ok) throw new Error('提交失败');
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return { taskId: data.taskId, estimatedMinutes: data.estimatedMinutes };
}

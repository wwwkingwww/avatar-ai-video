import { Router } from 'express';
import { withSession, requireStatus } from '../middleware/round-guard.js';
import { incrementRound, updateSession } from '../services/session-manager.js';
import { sendToAI, updateContextFromUser } from '../services/ai-proxy.js';

export const messagesRouter = Router();

messagesRouter.post('/:id/messages', withSession(), requireStatus('chatting'), async (req, res) => {
  const { content, attachments } = req.body;
  if (!content && (!attachments || attachments.length === 0)) {
    return res.status(400).json({ success: false, error: '消息内容不能为空' });
  }
  const session = req.session;
  const { round, forceConfirm } = await incrementRound(session);
  session.round = round;
  session.forceConfirm = forceConfirm;

  const newContext = updateContextFromUser(content, session.context || {});
  await updateSession(session.id, { context: newContext });

  let userContent = content || '';
  if (attachments && attachments.length > 0) {
    const currentFiles = session.files || [];
    const newFiles = attachments.map((url, i) => ({ url, name: `file_${Date.now()}_${i}` }));
    await updateSession(session.id, { files: [...currentFiles, ...newFiles] });
    userContent = content ? `${content}\n[已上传 ${attachments.length} 个文件]` : `[已上传 ${attachments.length} 个文件]`;
  }

  const history = session.history || [];
  history.push({ role: 'user', content: userContent });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let fullResponse = '';
  try {
    const stream = await sendToAI(history, session);
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) { // eslint-disable-line no-constant-condition
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const delta = data.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullResponse += delta;
              res.write(`data: ${JSON.stringify({ type: 'chunk', content: delta })}\n\n`);
            }
          } catch { /* skip */ }
        }
      }
    }
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: 'error', content: e.message })}\n\n`);
  }

  if (fullResponse) history.push({ role: 'assistant', content: fullResponse });
  await updateSession(session.id, { history });
  res.write(`data: ${JSON.stringify({ type: 'done', content: fullResponse, round, forceConfirm, context: newContext })}\n\n`);
  res.end();
});

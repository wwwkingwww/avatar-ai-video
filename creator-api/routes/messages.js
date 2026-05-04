import { Router } from 'express';
import { withSession, requireStatus } from '../middleware/round-guard.js';
import { incrementRound, updateSession } from '../services/session-manager.js';
import { sendToAI } from '../services/ai-proxy.js';

export const messagesRouter = Router();

messagesRouter.post('/:id/messages', withSession(), requireStatus('chatting'), async (req, res) => {
  const { content, attachments } = req.body;
  if (!content && (!attachments || attachments.length === 0)) {
    return res.status(400).json({ success: false, error: '消息内容不能为空' });
  }
  const session = req.session;
  const { round } = await incrementRound(session);
  session.round = round;

  if (attachments && attachments.length > 0) {
    const currentFiles = session.files || [];
    const newFiles = attachments.map((url, i) => ({ url, name: `file_${Date.now()}_${i}` }));
    await updateSession(session.id, { files: [...currentFiles, ...newFiles] });
  }

  const history = session.history || [];
  history.push({ role: 'user', content: content || '' });

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

  const sessionFiles = session.files || [];
  const hasFiles = sessionFiles.length > 0;
  const ctx = updateContextFromMessage(content, session.context || {}, sessionFiles);
  await updateSession(session.id, { history, context: ctx });
  session.context = ctx;

  if (fullResponse) history.push({ role: 'assistant', content: fullResponse });
  const aiCtx = updateContextFromMessage(fullResponse, ctx, sessionFiles);
  await updateSession(session.id, { history, context: aiCtx });
  session.context = aiCtx;

  res.write(`data: ${JSON.stringify({ type: 'done', content: fullResponse, round, context: aiCtx })}\n\n`);
  res.end();
});

function detectFileTypes(files) {
  let hasImage = false;
  let hasVideo = false;
  for (const f of files || []) {
    const name = (f.name || f.url || '').toLowerCase();
    const mime = (f.mimetype || f.type || '').toLowerCase();
    if (mime.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp')) {
      hasImage = true;
    }
    if (mime.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.avi') || name.endsWith('.webm')) {
      hasVideo = true;
    }
  }
  return { hasImage, hasVideo };
}

function updateContextFromMessage(text, ctx, files) {
  const next = JSON.parse(JSON.stringify(ctx));
  if (!next.intent) next.intent = {};

  const { hasImage: fileHasImage, hasVideo: fileHasVideo } = detectFileTypes(files);
  const effectiveHasImage = next.intent.hasImage || fileHasImage;
  const effectiveHasVideo = next.intent.hasVideo || fileHasVideo;
  next.intent.hasImage = effectiveHasImage;
  next.intent.hasVideo = effectiveHasVideo;

  const typeMap = { '文生视频': 'text-to-video', '图生视频': 'image-to-video', '文生图': 'text-to-image', '视频编辑': 'video-to-video' }
  for (const [label, key] of Object.entries(typeMap)) {
    if (text.includes(label)) { next.intent.taskType = key; break }
  }
  // 语义推断：有图片文件时优先图生视频，纯文本时文生视频
  if (!next.intent.taskType) {
    if (effectiveHasImage || effectiveHasVideo) {
      if (/视频/.test(text) && /做|生成|制作|创建|帮我|定制/.test(text)) {
        next.intent.taskType = 'image-to-video';
      }
    } else if (/视频/.test(text) && /做|生成|制作|创建|帮我|定制/.test(text)) {
      next.intent.taskType = 'text-to-video';
    }
  }

  // 平台
  const platMap = { '抖音': 'douyin', '快手': 'kuaishou', '小红书': 'xiaohongshu' }
  if (!next.platforms) next.platforms = []
  for (const [label, key] of Object.entries(platMap)) {
    if (text.includes(label) && !next.platforms.includes(key)) next.platforms.push(key)
  }

  // 脚本（取最长的用户消息作为脚本）
  if (text.length > 3 && !text.startsWith('✓') && !text.startsWith('确认') && !text.startsWith('提交') && !text.startsWith('上传') && !text.startsWith('没有')) {
    if (!next.intent.script || text.length > (next.intent.script || '').length) {
      next.intent.script = text
    }
  }

  return next
}

import { Router } from 'express';
import { createSession, getSession, deleteSession, listSessions } from '../services/session-manager.js';
import { withSession } from '../middleware/round-guard.js';

export const sessionsRouter = Router();

sessionsRouter.post('/', async (_req, res) => {
  try {
    const sessionId = await createSession();
    res.json({ success: true, sessionId, message: '你好！今天想做什么类型的视频？', round: 1 });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

sessionsRouter.get('/', async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const sessions = await listSessions(limit);
    res.json({ success: true, data: sessions });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

sessionsRouter.delete('/:id', async (req, res) => {
  try {
    const s = await getSession(req.params.id);
    if (!s) return res.status(404).json({ success: false, error: '会话不存在' });
    await deleteSession(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

sessionsRouter.get('/:id/confirm', withSession(), async (req, res) => {
  try {
    const s = req.session;
    const ctx = s.context || {};
    const phase = ctx.phase || 'INTENT';
    const intent = ctx.intent || {};

    let missing = [];
    if (phase === 'INTENT') missing = ['taskType'];
    else if (phase === 'PARAMS') {
      if (!intent.script) missing.push('script');
      if (!intent.preferredDuration) missing.push('duration');
      if (!ctx.platforms?.length) missing.push('platforms');
    }
    res.json({
      success: true,
      items: { phase, intent, platforms: ctx.platforms, files: s.files, selectedModel: ctx.selectedModel },
      missing,
      round: s.round,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

sessionsRouter.get('/:id/status', withSession(), async (req, res) => {
  const s = await getSession(req.session.id);
  res.json({ success: true, sessionId: s.id, status: s.status, round: s.round, taskId: s.taskId || null });
});

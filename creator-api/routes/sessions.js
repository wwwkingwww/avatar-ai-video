import { Router } from 'express';
import { createSession, getSession } from '../services/session-manager.js';
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

sessionsRouter.get('/:id/confirm', withSession(), async (req, res) => {
  try {
    const s = req.session;
    const requiredFields = ['template', 'content', 'platforms'];
    const missing = requiredFields.filter((f) => !s.context[f]);
    res.json({ success: true, items: { ...s.context, files: s.files }, missing, round: s.round });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

sessionsRouter.get('/:id/status', withSession(), async (req, res) => {
  const s = await getSession(req.session.id);
  res.json({ success: true, sessionId: s.id, status: s.status, round: s.round, taskId: s.taskId || null });
});

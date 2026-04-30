import { Router } from 'express';
import { withSession } from '../middleware/round-guard.js';
import { updateSession } from '../services/session-manager.js';
import { submitTaskToOpenClaw } from '../services/openclaw-proxy.js';

export const submitRouter = Router();

submitRouter.post('/:id/submit', withSession(), async (req, res) => {
  try {
    const session = req.session;
    const { taskId } = await submitTaskToOpenClaw(session);
    await updateSession(session.id, { status: 'submitted', taskId });
    res.json({ success: true, taskId, estimatedMinutes: 20 });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

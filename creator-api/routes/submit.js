import { Router } from 'express';
import { withSession } from '../middleware/round-guard.js';
import { updateSession } from '../services/session-manager.js';
import { dispatchTask } from '../services/task-dispatcher.js';

export const submitRouter = Router();

submitRouter.post('/:id/submit', withSession(), async (req, res) => {
  try {
    const session = req.session;
    const result = await dispatchTask(session);
    await updateSession(session.id, { status: 'submitted', taskId: result.taskId });
    res.json({ success: true, taskId: result.taskId, results: result.results, estimatedMinutes: 20 });
  } catch (e) {
    console.error('[submit] dispatch failed:', e.message);
    res.status(500).json({ success: false, error: `任务分发失败: ${e.message}` });
  }
});

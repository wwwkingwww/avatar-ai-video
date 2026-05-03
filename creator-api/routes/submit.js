import { Router } from 'express';
import { withSession, requireStatus } from '../middleware/round-guard.js';
import { updateSession, getSession } from '../services/session-manager.js';
import prisma from '../prisma/client.js';
import { generationQueue } from '../services/queue.js';

export const submitRouter = Router();

submitRouter.post('/:id/submit', withSession(), requireStatus('chatting', 'confirming'), async (req, res) => {
  try {
    const session = req.session;
    const ctx = session.context || {};
    const { scheduledAt } = req.body || {};
    const delay = scheduledAt ? Math.max(0, new Date(scheduledAt).getTime() - Date.now()) : 0;

    const status = delay > 0 ? 'SCHEDULED' : 'GENERATING';

    const hasV2 = !!(ctx.selectedModel && ctx.intent?.taskType)

    const task = await prisma.videoTask.create({
      data: {
        platform: Array.isArray(ctx.platforms) ? ctx.platforms.join(',') : (ctx.platforms || ''),
        template: ctx.template || ctx.intent?.taskType || '',
        script: ctx.intent?.script || ctx.script || '',
        tags: ctx.intent?.tags || ctx.tags || [],
        status,
        ...(delay > 0 ? { scheduledAt: new Date(scheduledAt) } : {}),
        ...(hasV2 ? {
          rhApiVersion: 'v2',
          modelEndpoint: ctx.selectedModel.endpoint,
          modelParams: ctx.selectedModel.params || {},
        } : {}),
      },
    });

    const job = await generationQueue.add('generate', {
      taskId: task.id,
      sessionId: session.id,
    }, {
      delay: delay > 0 ? delay : 0,
      jobId: `gen-${task.id}`,
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
    });

    await updateSession(session.id, {
      status: delay > 0 ? 'scheduled' : 'generating',
      taskId: task.id,
    });

    res.json({
      success: true,
      taskId: task.id,
      jobId: job.id,
      status,
      scheduledAt: scheduledAt || null,
      estimatedMinutes: delay > 0 ? null : 20,
    });
  } catch (e) {
    console.error('[submit] 任务提交失败:', e.message);
    await updateSession(req.session.id, { status: 'failed' }).catch(() => {});
    res.status(500).json({ success: false, error: `任务提交失败: ${e.message}` });
  }
});

submitRouter.post('/:id/cancel', withSession(), async (req, res) => {
  try {
    const session = req.session;
    if (!session.taskId) return res.status(400).json({ success: false, error: '当前会话没有关联任务' });

    const task = await prisma.videoTask.findUnique({ where: { id: session.taskId } });
    if (!task) return res.status(404).json({ success: false, error: '任务不存在' });

    const cancellable = ['DRAFT', 'SCHEDULED', 'GENERATING', 'GENERATED'];
    if (!cancellable.includes(task.status)) {
      return res.status(409).json({ success: false, error: `任务状态 ${task.status} 无法取消` });
    }

    try { await generationQueue.remove(`gen-${session.taskId}`); } catch { /* job may already be processed */ }
    try { await generationQueue.remove(`pub-${session.taskId}`); } catch { /* no publish job */ }

    await prisma.videoTask.update({
      where: { id: session.taskId },
      data: { status: 'CANCELLED' },
    });
    await updateSession(session.id, { status: 'cancelled', taskId: undefined });

    res.json({ success: true, taskId: session.taskId, status: 'CANCELLED' });
  } catch (e) {
    console.error('[submit] cancel error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

submitRouter.post('/:id/retry', withSession(), async (req, res) => {
  try {
    const session = req.session;
    if (!session.taskId) return res.status(400).json({ success: false, error: '当前会话没有关联任务' });

    const task = await prisma.videoTask.findUnique({ where: { id: session.taskId } });
    if (!task) return res.status(404).json({ success: false, error: '任务不存在' });

    if (task.retryCount >= 3) {
      return res.status(400).json({ success: false, error: '已达到最大重试次数 (3)' });
    }

    const nextRetry = (task.retryCount || 0) + 1;

    await prisma.videoTask.update({
      where: { id: session.taskId },
      data: { status: 'GENERATING', retryCount: nextRetry, error: null },
    });
    await updateSession(session.id, { status: 'generating' });

    await generationQueue.add('generate', {
      taskId: session.taskId,
      sessionId: session.id,
    }, {
      jobId: `gen-${session.taskId}-retry${nextRetry}`,
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
    });

    res.json({ success: true, taskId: session.taskId, status: 'GENERATING', retryCount: nextRetry });
  } catch (e) {
    console.error('[submit] retry error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

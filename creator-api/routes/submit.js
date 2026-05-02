import { Router } from 'express';
import { withSession, requireStatus } from '../middleware/round-guard.js';
import { updateSession } from '../services/session-manager.js';
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

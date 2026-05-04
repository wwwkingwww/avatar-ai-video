import { Router } from 'express'
import { withSession, requireStatus } from '../middleware/round-guard.js'
import { updateSession, getSession } from '../services/session-manager.js'
import prisma, { prismaError } from '../prisma/client.js'
import { generationQueue, publishQueue } from '../services/queue.js'

const debugLog = (...args) => { if (process.env.DEBUG) console.log(...args) }

export const submitRouter = Router()

submitRouter.post('/:id/submit', withSession(), requireStatus('chatting'), async (req, res) => {
  if (prismaError) {
    return res.status(503).json({ success: false, error: `任务提交不可用: ${prismaError}` })
  }
  try {
    const session = req.session;
    const ctx = session.context || {};
    const { scheduledAt, selectedModel } = req.body || {};
    const delay = scheduledAt ? Math.max(0, new Date(scheduledAt).getTime() - Date.now()) : 0;

    if (selectedModel) {
      ctx.selectedModel = selectedModel;
      await updateSession(session.id, { context: ctx });
    }

    if (!ctx.selectedModel?.endpoint) {
      let taskType = ctx.intent?.taskType || ctx.template || ''
      if (!taskType) {
        const hasFiles = (session.files || []).length > 0
        const fileHasImage = ctx.intent?.hasImage
        const fileHasVideo = ctx.intent?.hasVideo
        if (fileHasImage || fileHasVideo) {
          taskType = 'image-to-video'
        } else {
          taskType = 'text-to-video'
        }
        if (!ctx.intent) ctx.intent = {}
        ctx.intent.taskType = taskType
      }
      ctx.selectedModel = {
        endpoint: taskType === 'image-to-video'
          ? 'alibaba/happyhorse-1.0/image-to-video'
          : 'alibaba/happyhorse-1.0/text-to-video',
        params: {},
      }
      await updateSession(session.id, { context: ctx })
      debugLog(`[submit] no model selected, defaulting to ${ctx.selectedModel.endpoint} (taskType=${taskType})`)
    }

    const status = delay > 0 ? 'SCHEDULED' : 'GENERATING'

    const task = await prisma.videoTask.create({
      data: {
        platform: Array.isArray(ctx.platforms) ? ctx.platforms.join(',') : (ctx.platforms || ''),
        template: ctx.template || ctx.intent?.taskType || '',
        script: ctx.intent?.script || ctx.script || '',
        tags: ctx.intent?.tags || ctx.tags || [],
        status,
        ...(delay > 0 ? { scheduledAt: new Date(scheduledAt) } : {}),
        rhApiVersion: 'v2',
        modelEndpoint: ctx.selectedModel?.endpoint || null,
        modelParams: ctx.selectedModel?.params || {},
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
  if (prismaError) {
    return res.status(503).json({ success: false, error: `取消不可用: ${prismaError}` })
  }
  try {
    const session = req.session;
    if (!session.taskId) return res.status(400).json({ success: false, error: '当前会话没有关联任务' });

    const task = await prisma.videoTask.findUnique({ where: { id: session.taskId } });
    if (!task) return res.status(404).json({ success: false, error: '任务不存在' });

    const cancellable = ['DRAFT', 'SCHEDULED', 'GENERATING', 'GENERATED', 'AWAITING_REVIEW'];
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
  if (prismaError) {
    return res.status(503).json({ success: false, error: `重试不可用: ${prismaError}` })
  }
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

submitRouter.post('/:id/approve', withSession(), async (req, res) => {
  if (prismaError) {
    return res.status(503).json({ success: false, error: `审核发布不可用: ${prismaError}` })
  }
  try {
    const session = req.session;
    if (!session.taskId) return res.status(400).json({ success: false, error: '当前会话没有关联任务' });

    const task = await prisma.videoTask.findUnique({ where: { id: session.taskId } });
    if (!task) return res.status(404).json({ success: false, error: '任务不存在' });

    if (task.status !== 'AWAITING_REVIEW') {
      return res.status(409).json({ success: false, error: `任务状态 ${task.status} 不允许审核发布，需要 AWAITING_REVIEW` });
    }

    const platforms = (session.context?.platforms || []).filter(p => p);
    const videoUrl = task.videoUrl;
    if (!videoUrl) {
      return res.status(400).json({ success: false, error: '视频尚未生成，无法发布' });
    }
    if (platforms.length === 0) {
      await prisma.videoTask.update({
        where: { id: session.taskId },
        data: { status: 'GENERATED' },
      });
      await updateSession(session.id, { status: 'generated' });
      return res.json({ success: true, taskId: session.taskId, status: 'GENERATED', note: 'no platforms configured, video saved without publishing' });
    }

    await prisma.videoTask.update({
      where: { id: session.taskId },
      data: { status: 'PUBLISHING' },
    });
    await updateSession(session.id, { status: 'publishing' });

    await publishQueue.add('publish-all', {
      taskId: session.taskId,
      sessionId: session.id,
      platforms,
      videoUrl,
    }, { jobId: `pub-${session.taskId}` });

    debugLog(`[approve] user approved publish for task ${session.taskId}, platforms: ${platforms.join(',')}`)
    res.json({ success: true, taskId: session.taskId, status: 'PUBLISHING', platforms });
  } catch (e) {
    console.error('[approve] error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

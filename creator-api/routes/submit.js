import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { withSession, requireStatus } from '../middleware/round-guard.js'
import { updateSession, getSession } from '../services/session-manager.js'
import prisma, { prismaError, isDatabaseAvailable } from '../prisma/client.js'
import { generationQueue, publishQueue } from '../services/queue.js'
import { logger } from '../services/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MOCK_DATA_DIR = process.env.MOCK_DATA_DIR || join(__dirname, '..', 'data')
const MOCK_TASKS_FILE = join(MOCK_DATA_DIR, 'mock-tasks.json')

const MAX_RETRY_COUNT = parseInt(process.env.MAX_RETRY_COUNT, 10) || 3
const DEFAULT_IMAGE_TO_VIDEO_MODEL = process.env.DEFAULT_IMAGE_TO_VIDEO_MODEL || 'rhart-video/ltx-2.3/image-to-video'
const DEFAULT_TEXT_TO_VIDEO_MODEL = process.env.DEFAULT_TEXT_TO_VIDEO_MODEL || 'rhart-video/ltx-2.3/text-to-video'

function ensureMockDataDir() {
  if (!existsSync(MOCK_DATA_DIR)) {
    mkdirSync(MOCK_DATA_DIR, { recursive: true })
  }
}

// 带文件持久化的内存存储（当数据库不可用时使用）
const mockTasks = new Map()
let mockTaskIdCounter = 0

function loadMockTasks() {
  try {
    if (existsSync(MOCK_TASKS_FILE)) {
      const raw = readFileSync(MOCK_TASKS_FILE, 'utf-8')
      const data = JSON.parse(raw)
      mockTaskIdCounter = data.counter || 0
      for (const task of data.tasks || []) {
        task.createdAt = new Date(task.createdAt)
        task.updatedAt = new Date(task.updatedAt)
        if (task.scheduledAt) task.scheduledAt = new Date(task.scheduledAt)
        mockTasks.set(task.id, task)
      }
      logger.debug(`[submit] 从磁盘加载了 ${mockTasks.size} 个 mock 任务`)
    }
  } catch (e) {
    logger.debug(`[submit] 加载 mock 任务失败: ${e.message}`)
  }
}

function saveMockTasks() {
  try {
    ensureMockDataDir()
    const data = {
      counter: mockTaskIdCounter,
      tasks: Array.from(mockTasks.values()),
    }
    writeFileSync(MOCK_TASKS_FILE, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    logger.debug(`[submit] 保存 mock 任务失败: ${e.message}`)
  }
}

function createMockTask(data) {
  const id = `mock-job-${++mockTaskIdCounter}`
  const task = {
    id,
    platform: data.platform || '',
    template: data.template || '',
    script: data.script || '',
    tags: data.tags || [],
    status: data.status || 'GENERATING',
    scheduledAt: data.scheduledAt || null,
    videoUrl: null,
    thumbnailUrl: null,
    retryCount: 0,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  mockTasks.set(id, task)
  saveMockTasks()
  return task
}

// 启动时加载已有 mock 数据
loadMockTasks()

export const submitRouter = Router()

submitRouter.post('/:id/submit', withSession(), requireStatus('chatting'), async (req, res) => {
  const useMock = !isDatabaseAvailable()
  if (useMock) {
    logger.debug('[submit] 使用内存模式（数据库不可用）')
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
          ? DEFAULT_IMAGE_TO_VIDEO_MODEL
          : DEFAULT_TEXT_TO_VIDEO_MODEL,
        params: {},
      }
      await updateSession(session.id, { context: ctx })
      logger.debug(`[submit] no model selected, defaulting to ${ctx.selectedModel.endpoint} (taskType=${taskType})`)
    }

    const status = delay > 0 ? 'SCHEDULED' : 'GENERATING'

    let task
    try {
      task = await prisma.videoTask.create({
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
    } catch (dbError) {
      logger.debug('[submit] 数据库操作失败，使用内存模式:', dbError.message)
      task = createMockTask({
        platform: Array.isArray(ctx.platforms) ? ctx.platforms.join(',') : (ctx.platforms || ''),
        template: ctx.template || ctx.intent?.taskType || '',
        script: ctx.intent?.script || ctx.script || '',
        tags: ctx.intent?.tags || ctx.tags || [],
        status,
        scheduledAt: delay > 0 ? new Date(scheduledAt) : null,
      })
    }

    let jobId = null
    try {
      const job = await generationQueue.add('generate', {
        taskId: task.id,
        sessionId: session.id,
      }, {
        delay: delay > 0 ? delay : 0,
        jobId: `gen-${task.id}`,
        attempts: 2,
        backoff: { type: 'exponential', delay: 30000 },
      });
      jobId = job.id
    } catch (e) {
      logger.debug('[submit] 队列添加失败:', e.message)
    }

    await updateSession(session.id, {
      status: delay > 0 ? 'scheduled' : 'submitted',
      taskId: task.id,
    });

    res.json({
      success: true,
      taskId: task.id,
      jobId: jobId,
      status,
      scheduledAt: scheduledAt || null,
      estimatedMinutes: delay > 0 ? null : 20,
    });
  } catch (e) {
    logger.error('[submit] 任务提交失败:', e.message);
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

    try { await generationQueue.remove(`gen-${session.taskId}`); } catch (e) { logger.debug('[submit] cancel gen job:', e.message) }
    try { await publishQueue.remove(`pub-${session.taskId}`); } catch (e) { logger.debug('[submit] cancel pub job:', e.message) }

    await prisma.videoTask.update({
      where: { id: session.taskId },
      data: { status: 'CANCELLED' },
    });
    await updateSession(session.id, { status: 'cancelled', taskId: undefined });

    res.json({ success: true, taskId: session.taskId, status: 'CANCELLED' });
  } catch (e) {
    logger.error('[submit] cancel error:', e.message);
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
    logger.error('[submit] retry error:', e.message);
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

    logger.debug(`[approve] user approved publish for task ${session.taskId}, platforms: ${platforms.join(',')}`)
    res.json({ success: true, taskId: session.taskId, status: 'PUBLISHING', platforms });
  } catch (e) {
    logger.error('[approve] error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

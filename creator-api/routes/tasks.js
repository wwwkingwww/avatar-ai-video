import { Router } from 'express'
import prisma, { prismaError } from '../prisma/client.js'

export const tasksRouter = Router()

tasksRouter.get('/:id/progress', async (req, res) => {
  if (prismaError) {
    return res.status(503).json({ success: false, error: prismaError })
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const taskId = req.params.id
  let lastStatus = ''
  let ticks = 0

  const push = async () => {
    try {
      const task = await prisma.videoTask.findUnique({
        where: { id: taskId },
        select: {
          id: true, status: true, template: true, script: true,
          platform: true, videoUrl: true, thumbnailUrl: true, error: true,
          rhTaskId: true, rhApiVersion: true, publishResult: true,
          retryCount: true, createdAt: true, updatedAt: true,
          scheduledAt: true,
        },
      })

      if (!task) {
        res.write(`data: ${JSON.stringify({ type: 'error', content: '任务不存在' })}\n\n`)
        res.end()
        return
      }

      if (task.status !== lastStatus) {
        lastStatus = task.status
        res.write(`data: ${JSON.stringify({
          type: 'update',
          status: task.status,
          template: task.template,
          script: task.script,
          platform: task.platform,
          videoUrl: task.videoUrl,
          thumbnailUrl: task.thumbnailUrl,
          error: task.error,
          rhTaskId: task.rhTaskId,
          publishResult: task.publishResult,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        })}\n\n`)
      }

      const isTerminal = ['PUBLISHED', 'FAILED', 'PUBLISH_FAILED', 'CANCELLED'].includes(task.status)
      if (isTerminal) {
        res.write(`data: ${JSON.stringify({ type: 'done', status: task.status })}\n\n`)
        res.end()
        return
      }

      ticks++
      if (ticks >= 300) { // 10分钟超时
        res.write(`data: ${JSON.stringify({ type: 'timeout', content: '任务超时，请刷新查看' })}\n\n`)
        res.end()
        return
      }

      setTimeout(push, 2000)
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: e.message })}\n\n`)
      res.end()
    }
  }

  req.on('close', () => { lastStatus = '__closed__' })
  push()
})

tasksRouter.get('/:id', async (req, res) => {
  if (prismaError) {
    return res.status(503).json({ success: false, error: prismaError })
  }
  try {
    const task = await prisma.videoTask.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        status: true,
        template: true,
        script: true,
        platform: true,
        videoUrl: true,
        thumbnailUrl: true,
        scheduledAt: true,
        createdAt: true,
        updatedAt: true,
        error: true,
        rhTaskId: true,
        rhApiVersion: true,
        publishResult: true,
        retryCount: true,
      },
    })

    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' })
    }

    res.json({
      success: true,
      data: {
        id: task.id,
        status: task.status,
        template: task.template,
        platform: task.platform,
        videoUrl: task.videoUrl,
        thumbnailUrl: task.thumbnailUrl,
        error: task.error,
        rhTaskId: task.rhTaskId,
        rhApiVersion: task.rhApiVersion,
        publishResult: task.publishResult,
        retryCount: task.retryCount,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        scheduledAt: task.scheduledAt,
      },
    })
  } catch (e) {
    console.error('[tasks] get/:id error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

tasksRouter.get('/', async (_req, res) => {
  if (prismaError) {
    return res.json({ success: true, pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }, data: [] })
  }
  try {
    const page = Math.max(1, parseInt(_req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(_req.query.limit) || 20))
    const skip = (page - 1) * limit

    const where = {}
    if (_req.query.status) {
      const statuses = _req.query.status.split(',').filter(Boolean)
      if (statuses.length === 1) {
        where.status = statuses[0]
      } else if (statuses.length > 1) {
        where.status = { in: statuses }
      }
    }
    if (_req.query.platform) {
      const platforms = _req.query.platform.split(',').filter(Boolean)
      if (platforms.length === 1) {
        where.platform = platforms[0]
      } else if (platforms.length > 1) {
        where.platform = { in: platforms }
      }
    }

    const [tasks, total] = await Promise.all([
      prisma.videoTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true, status: true, template: true, script: true,
          platform: true, videoUrl: true, thumbnailUrl: true,
          scheduledAt: true, createdAt: true, updatedAt: true,
          error: true, modelEndpoint: true,
        },
      }),
      prisma.videoTask.count({ where }),
    ])

    res.json({
      success: true,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      data: tasks.map((t) => ({
        id: t.id,
        status: t.status,
        template: t.template,
        script: t.script?.substring(0, 100) || '',
        platform: t.platform,
        videoUrl: t.videoUrl,
        thumbnailUrl: t.thumbnailUrl,
        title: t.script?.substring(0, 50) || t.template || '未命名项目',
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        scheduledAt: t.scheduledAt,
        error: t.error,
        modelEndpoint: t.modelEndpoint,
      })),
    })
  } catch (e) {
    console.error('[tasks] error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

import { Router } from 'express'
import prisma from '../prisma/client.js'

export const tasksRouter = Router()

tasksRouter.get('/:id', async (req, res) => {
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

tasksRouter.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20))
    const skip = (page - 1) * limit

    const where = {}
    if (req.query.status) {
      const statuses = req.query.status.split(',').filter(Boolean)
      if (statuses.length === 1) {
        where.status = statuses[0]
      } else if (statuses.length > 1) {
        where.status = { in: statuses }
      }
    }
    if (req.query.platform) {
      const platforms = req.query.platform.split(',').filter(Boolean)
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

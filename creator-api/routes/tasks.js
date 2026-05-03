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

tasksRouter.get('/', async (_req, res) => {
  try {
    const tasks = await prisma.videoTask.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
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
        modelEndpoint: true,
      },
    })

    res.json({
      success: true,
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

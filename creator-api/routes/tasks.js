import { Router } from 'express'
import prisma from '../prisma/client.js'

export const tasksRouter = Router()

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

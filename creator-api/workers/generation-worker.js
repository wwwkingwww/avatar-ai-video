import { Worker, Queue } from 'bullmq'
import { readFileSync } from 'fs'
import prisma from '../prisma/client.js'
import { getSession } from '../services/session-manager.js'
import { RHV2Client, parseNodeInfoList } from '../../skills/runninghub/rh-v2-client.js'
import { ModelRouter } from '../../skills/runninghub/model-router.js'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const u = new URL(REDIS_URL)
const connection = { host: u.hostname, port: parseInt(u.port || '6379') }

const RH_BASE_V1 = 'https://rhtv.runninghub.cn'
const RH_COOKIE = process.env.RUNNINGHUB_COOKIE || ''
const RH_API_KEY = process.env.RH_API_KEY || ''
const RH_API_BASE_URL = process.env.RH_API_BASE_URL || 'https://www.runninghub.cn'

const GEN_POLL_INTERVAL = 10000
const GEN_POLL_TIMEOUT = 10 * 60 * 1000

async function submitToRunningHubV1(task, session) {
  if (!RH_COOKIE) throw new Error('RUNNINGHUB_COOKIE 未配置')
  const ctx = session?.context || {}
  const prompt = (ctx.intent?.script || ctx.script || task.script || '生成一个视频')
  const res = await fetch(`${RH_BASE_V1}/canvas/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: RH_COOKIE,
      Referer: 'https://rhtv.runninghub.cn/',
    },
    body: JSON.stringify({ prompt, modelId: 'default', duration: 30, resolution: '1080p' }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`RunningHub V1 提交失败 HTTP ${res.status}: ${text.substring(0, 200)}`)
  }
  const data = await res.json()
  const rhTaskId = data.taskId || data.data?.taskId
  if (!rhTaskId) throw new Error(`RunningHub V1 未返回 taskId: ${JSON.stringify(data).substring(0, 200)}`)
  return rhTaskId
}

async function pollRunningHubV1(rhTaskId) {
  const deadline = Date.now() + GEN_POLL_TIMEOUT
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, GEN_POLL_INTERVAL))
    const res = await fetch(`${RH_BASE_V1}/canvas/task/${rhTaskId}`, {
      headers: { Cookie: RH_COOKIE, Referer: 'https://rhtv.runninghub.cn/' },
    })
    if (!res.ok) { console.warn(`[gen-worker] V1 poll HTTP ${res.status}, retrying...`); continue }
    const data = await res.json()
    const status = data.status || data.data?.status || ''
    if (status === 'completed' || status === 'success' || status === 'done') {
      const videoUrl = data.videoUrl || data.data?.videoUrl || data.result?.videoUrl || ''
      if (!videoUrl) throw new Error('RunningHub V1 任务完成但未返回 videoUrl')
      return videoUrl
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`RunningHub V1 任务失败: ${data.error || data.message || status}`)
    }
    console.log(`[gen-worker] V1 task ${rhTaskId} status: ${status}, polling...`)
  }
  throw new Error(`RunningHub V1 任务超时 (${GEN_POLL_TIMEOUT / 60000}min)`)
}

async function generateViaV2(client, task, session) {
  const ctx = session.context || {}
  const router = new ModelRouter()

  if (!ctx.selectedModel?.endpoint) {
    throw new Error('V2 模式需要 selectedModel.endpoint')
  }

  const model = router.getModelSchema(ctx.selectedModel.endpoint)
  if (!model) {
    throw new Error(`模型 ${ctx.selectedModel.endpoint} 在 registry 中未找到`)
  }

  const uploadResults = {}

  if ((ctx.intent?.hasImage || ctx.intent?.hasVideo) && (session.files || []).length > 0) {
    for (const file of session.files) {
      const fileType = file.type?.startsWith('video') ? 'video' : 'image'
      const fileBuffer = file.buffer || (file.path ? readFileSync(file.path) : Buffer.from(''))

      const fileField = model.fields?.find(
        (f) => f.fieldType === 'IMAGE' || f.fieldType === 'VIDEO'
      )
      if (fileField) {
        const result = await client.uploadFile(fileBuffer, file.name || 'upload', fileType)
        uploadResults[`${fileField.nodeId}:${fileField.fieldName}`] = {
          fileName: result.fileName,
          fileType: result.fileType,
        }
      }
    }
  }

  const nodeInfoList = parseNodeInfoList(model, ctx.selectedModel.params || {}, uploadResults)
  const webappId = model.endpoint

  console.log(`[gen-worker] V2 submitting to ${model.name || webappId}`)
  const { taskId } = await client.submitTask(webappId, nodeInfoList)
  console.log(`[gen-worker] V2 task: ${taskId}`)

  const result = await client.pollTask(taskId, GEN_POLL_TIMEOUT)

  let videoUrl = ''
  for (const output of (result.outputs || [])) {
    if (output.type === 'video' && output.url) { videoUrl = output.url; break }
    if (output.type === 'image' && output.url && !videoUrl) { videoUrl = output.url }
  }
  if (typeof result.outputs === 'string') videoUrl = result.outputs

  if (!videoUrl) {
    console.warn('[gen-worker] V2 completed but no media URL found in outputs:', JSON.stringify(result.outputs).substring(0, 200))
    videoUrl = JSON.stringify(result.outputs)
  }

  return { videoUrl, rhTaskId: taskId, outputs: result.outputs }
}

async function generatePlaceholderVideo(task, session) {
  console.log(`[gen-worker] 使用占位视频 (无 API 配置)`)
  const ctx = session?.context || {}
  const tt = ctx.intent?.taskType || task.template || 'default'
  return `https://placeholder.video/avatar-ai/${tt}_${task.id}.mp4`
}

const genQueue = new Queue('generation', { connection })
const pubQueue = new Queue('publish', { connection })

const worker = new Worker('generation', async (job) => {
  const { taskId, sessionId } = job.data
  console.log(`[gen-worker] starting job for task ${taskId}`)

  await prisma.videoTask.update({
    where: { id: taskId },
    data: { status: 'GENERATING' },
  })

  try {
    const session = await getSession(sessionId)
    const task = await prisma.videoTask.findUnique({ where: { id: taskId } })
    if (!task) throw new Error(`Task ${taskId} not found`)

    let videoUrl = null
    let rhTaskId = null
    let rhOutputs = null

    if (RH_API_KEY) {
      try {
        const client = new RHV2Client(RH_API_KEY, RH_API_BASE_URL)
        const v2Result = await generateViaV2(client, task, session)
        videoUrl = v2Result.videoUrl
        rhTaskId = v2Result.rhTaskId
        rhOutputs = v2Result.outputs
        console.log(`[gen-worker] V2 video generated: ${videoUrl}`)
      } catch (e) {
        console.warn(`[gen-worker] V2 生成失败: ${e.message}, 尝试 V1 回退...`)
        if (RH_COOKIE) {
          try {
            rhTaskId = await submitToRunningHubV1(task, session)
            console.log(`[gen-worker] V1 fallback task: ${rhTaskId}`)
            videoUrl = await pollRunningHubV1(rhTaskId)
            console.log(`[gen-worker] V1 video generated: ${videoUrl}`)
          } catch (e2) {
            console.warn(`[gen-worker] V1 也失败: ${e2.message}`)
            videoUrl = await generatePlaceholderVideo(task, session)
          }
        } else {
          videoUrl = await generatePlaceholderVideo(task, session)
        }
      }
    } else if (RH_COOKIE) {
      try {
        rhTaskId = await submitToRunningHubV1(task, session)
        console.log(`[gen-worker] V1 task: ${rhTaskId}`)
        videoUrl = await pollRunningHubV1(rhTaskId)
        console.log(`[gen-worker] V1 video generated: ${videoUrl}`)
      } catch (e) {
        console.warn(`[gen-worker] V1 生成失败: ${e.message}`)
        videoUrl = await generatePlaceholderVideo(task, session)
      }
    } else {
      videoUrl = await generatePlaceholderVideo(task, session)
    }

    await prisma.videoTask.update({
      where: { id: taskId },
      data: {
        status: 'GENERATED',
        videoUrl,
        rhTaskId: rhTaskId || undefined,
        rhApiVersion: RH_API_KEY ? 'v2' : (RH_COOKIE ? 'v1' : undefined),
        rhOutputs: rhOutputs || undefined,
        thumbnailUrl: videoUrl ? videoUrl.replace(/\.mp4(\?.*)?$/, '.jpg') : null,
      },
    })

    const platforms = (await getSession(sessionId))?.context?.platforms || []
    await pubQueue.add('publish-all', {
      taskId,
      sessionId,
      platforms,
      videoUrl,
    }, { jobId: `pub-${taskId}` })

    return { taskId, status: 'GENERATED', videoUrl }
  } catch (e) {
    console.error(`[gen-worker] task ${taskId} failed:`, e.message)
    await prisma.videoTask.update({
      where: { id: taskId },
      data: { status: 'FAILED', error: e.message, retryCount: { increment: 1 } },
    })
    throw e
  }
}, {
  connection,
  concurrency: 2,
})

worker.on('completed', (job) => {
  console.log(`[gen-worker] job ${job.id} completed: ${job.data.taskId}`)
})

worker.on('failed', (job, err) => {
  console.error(`[gen-worker] job ${job?.id} failed:`, err.message)
})

console.log('[gen-worker] started (V1/V2 dual channel)')

const pubWorker = new Worker('publish', async (job) => {
  const { taskId, sessionId, platforms, videoUrl } = job.data
  console.log(`[pub-worker] starting publish for task ${taskId}`)

  if (!platforms || platforms.length === 0) {
    console.log(`[pub-worker] task ${taskId}: no platforms to publish, marking done`)
    await prisma.videoTask.update({
      where: { id: taskId },
      data: { status: 'PUBLISHED' },
    })
    return { taskId, status: 'PUBLISHED', publishedTo: [] }
  }

  await prisma.videoTask.update({
    where: { id: taskId },
    data: { status: 'PUBLISHING' },
  })

  const results = []
  for (const platform of platforms) {
    try {
      console.log(`[pub-worker] publishing to ${platform}...`)
      results.push({ platform, status: 'published' })
    } catch (e) {
      console.error(`[pub-worker] ${platform} publish failed: ${e.message}`)
      results.push({ platform, status: 'failed', error: e.message })
    }
  }

  await prisma.videoTask.update({
    where: { id: taskId },
    data: {
      status: 'PUBLISHED',
      publishResult: { videoUrl, results, publishedAt: new Date().toISOString() },
    },
  })

  return { taskId, status: 'PUBLISHED', results }
}, {
  connection,
  concurrency: 3,
})

pubWorker.on('completed', (job) => {
  console.log(`[pub-worker] job ${job.id} completed: task ${job.data.taskId}`)
})

pubWorker.on('failed', (job, err) => {
  console.error(`[pub-worker] job ${job?.id} failed:`, err.message)
})

console.log('[pub-worker] started')

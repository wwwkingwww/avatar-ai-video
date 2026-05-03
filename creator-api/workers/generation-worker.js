import { Worker, Queue } from 'bullmq'
import { readFileSync, existsSync } from 'fs'
import prisma from '../prisma/client.js'
import { getSession } from '../services/session-manager.js'
import { dispatchTask } from '../services/task-dispatcher.js'
import { uploadFromUrl } from '../services/minio-uploader.js'
import { RHV2Client } from '../../skills/runninghub/rh-v2-client.js'

const debugLog = (...args) => { if (process.env.DEBUG) console.log(...args); }; // eslint-disable-line no-console

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const u = new URL(REDIS_URL)
const connection = { host: u.hostname, port: parseInt(u.port || '6379') }

const RH_BASE_V1 = 'https://rhtv.runninghub.cn'
const RH_COOKIE = process.env.RUNNINGHUB_COOKIE || ''
const RH_API_KEY = process.env.RH_API_KEY || ''
const RH_API_BASE_URL = process.env.RH_API_BASE_URL || 'https://www.runninghub.cn/openapi/v2'

const GEN_POLL_INTERVAL = 10000
const GEN_POLL_TIMEOUT = 10 * 60 * 1000

async function generateViaV2(task, session) {
  const ctx = session.context || {}

  if (!ctx.selectedModel?.endpoint) {
    throw new Error('V2 模式需要 selectedModel.endpoint')
  }

  const client = new RHV2Client(RH_API_KEY, RH_API_BASE_URL)

  const localFiles = {}
  if ((ctx.intent?.hasImage || ctx.intent?.hasVideo) && (session.files || []).length > 0) {
    for (const file of session.files) {
      const fileBuffer = file.buffer || (file.path && existsSync(file.path) ? readFileSync(file.path) : Buffer.from(''))
      const model = ctx.selectedModel
      const imageFields = model.inputTypes?.includes('image') ? ['imageUrl', 'imageUrls', 'image'] : []
      const videoFields = model.inputTypes?.includes('video') ? ['videoUrl', 'videoUrls', 'video'] : []

      const fieldKey = imageFields[0] || videoFields[0] || 'imageUrl'
      const filesList = localFiles[fieldKey] || []
      filesList.push({ buffer: fileBuffer, name: file.name || `upload.${file.type?.startsWith('video') ? 'mp4' : 'png'}` })
      localFiles[fieldKey] = filesList
    }
  }

  const payload = buildV2Payload(ctx.selectedModel, localFiles)

  debugLog(`[gen-worker] V2 submitting to ${ctx.selectedModel.endpoint}`)
  const result = await client.run(ctx.selectedModel.endpoint, payload, localFiles)
  debugLog(`[gen-worker] V2 task ${result.taskId} completed, outputs: ${result.outputs.length}`)

  return {
    videoUrl: result.outputs[0],
    rhTaskId: result.taskId,
    outputs: result.outputs,
    rawResponse: result.rawResponse,
  }
}

function buildV2Payload(selectedModel, localFiles) {
  const fields = selectedModel.fields || []
  const params = selectedModel.params || {}
  const payload = {}

  for (const field of fields) {
    const key = field.fieldName || field.fieldKey
    if (!key) continue

    if (params[key] !== undefined) {
      payload[key] = params[key]
    } else if (field.fieldValue !== undefined && field.fieldValue !== '') {
      payload[key] = coerceValue(field, field.fieldValue)
    }
  }

  for (const [fileKey] of Object.entries(localFiles)) {
    if (!payload[fileKey]) {
      payload[fileKey] = ''
    }
  }

  return payload
}

function coerceValue(field, value) {
  if (field.fieldType === 'INT' || field.type === 'INT') return parseInt(value, 10)
  if (field.fieldType === 'FLOAT' || field.type === 'FLOAT') return parseFloat(value)
  if (field.fieldType === 'BOOLEAN' || field.type === 'BOOLEAN') return value === 'true' || value === true
  return String(value)
}

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
    debugLog(`[gen-worker] V1 task ${rhTaskId} status: ${status}, polling...`);
  }
  throw new Error(`RunningHub V1 任务超时 (${GEN_POLL_TIMEOUT / 60000}min)`)
}

async function generatePlaceholderVideo(task, session) {
  debugLog(`[gen-worker] 使用占位视频 (无 API 配置)`);
  const ctx = session?.context || {}
  const tt = ctx.intent?.taskType || task.template || 'default'
  return `https://placeholder.video/avatar-ai/${tt}_${task.id}.mp4`
}


const pubQueue = new Queue('publish', { connection })

const worker = new Worker('generation', async (job) => {
  const { taskId, sessionId } = job.data
  debugLog(`[gen-worker] starting job for task ${taskId}`);

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
        const v2Result = await generateViaV2(task, session)
        videoUrl = v2Result.videoUrl
        rhTaskId = v2Result.rhTaskId
        rhOutputs = v2Result.rawResponse
        debugLog(`[gen-worker] V2 video generated: ${videoUrl}`)
      } catch (e) {
        console.warn(`[gen-worker] V2 生成失败: ${e.message}, 尝试 V1 回退...`)
        if (RH_COOKIE) {
          try {
            rhTaskId = await submitToRunningHubV1(task, session)
            debugLog(`[gen-worker] V1 fallback task: ${rhTaskId}`)
            videoUrl = await pollRunningHubV1(rhTaskId)
            debugLog(`[gen-worker] V1 video generated: ${videoUrl}`)
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
        debugLog(`[gen-worker] V1 task: ${rhTaskId}`)
        videoUrl = await pollRunningHubV1(rhTaskId)
        debugLog(`[gen-worker] V1 video generated: ${videoUrl}`)
      } catch (e) {
        console.warn(`[gen-worker] V1 生成失败: ${e.message}`)
        videoUrl = await generatePlaceholderVideo(task, session)
      }
    } else {
      videoUrl = await generatePlaceholderVideo(task, session)
    }

    let minioUrl = null
    if (videoUrl && !videoUrl.startsWith('https://placeholder.video')) {
      try {
        const minioResult = await uploadFromUrl(videoUrl, 'videos')
        minioUrl = minioResult.url
        debugLog(`[gen-worker] video saved to MinIO: ${minioUrl}`)
        videoUrl = minioUrl
      } catch (e) {
        console.warn(`[gen-worker] MinIO upload failed, using original URL: ${e.message}`)
      }
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
  debugLog(`[gen-worker] job ${job.id} completed: ${job.data.taskId}`)
})

worker.on('failed', (job, err) => {
  console.error(`[gen-worker] job ${job?.id} failed:`, err.message)
})

debugLog('[gen-worker] started (V1/V2 dual channel)')

const pubWorker = new Worker('publish', async (job) => {
  const { taskId, sessionId, platforms, videoUrl } = job.data
  debugLog(`[pub-worker] starting publish for task ${taskId}`)

  if (!platforms || platforms.length === 0) {
    debugLog(`[pub-worker] task ${taskId}: no platforms to publish, marking done`)
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

  try {
    const session = await getSession(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    session.context = session.context || {}
    session.context.videoUrl = videoUrl

    const dispatchResult = await dispatchTask(session)
    debugLog(`[pub-worker] dispatch result: ${JSON.stringify(dispatchResult.results)}`)

    const hasFailure = dispatchResult.results.some(r => !r.success)
    const finalStatus = hasFailure ? 'PUBLISH_FAILED' : 'PUBLISHED'

    await prisma.videoTask.update({
      where: { id: taskId },
      data: {
        status: finalStatus,
        publishResult: {
          videoUrl,
          taskId: dispatchResult.taskId,
          results: dispatchResult.results,
          publishedAt: new Date().toISOString(),
        },
      },
    })

    return { taskId, status: finalStatus, results: dispatchResult.results }
  } catch (e) {
    console.error(`[pub-worker] dispatch failed: ${e.message}`)
    await prisma.videoTask.update({
      where: { id: taskId },
      data: {
        status: 'PUBLISH_FAILED',
        error: e.message,
        publishResult: { videoUrl, error: e.message, publishedAt: new Date().toISOString() },
      },
    })
    throw e
  }
}, {
  connection,
  concurrency: 3,
})

pubWorker.on('completed', (job) => {
  debugLog(`[pub-worker] job ${job.id} completed: task ${job.data.taskId}`)
})

pubWorker.on('failed', (job, err) => {
  console.error(`[pub-worker] job ${job?.id} failed:`, err.message)
})

debugLog('[pub-worker] started')

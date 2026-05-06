import { Worker, Queue } from 'bullmq'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import prisma from '../prisma/client.js'
import { getSession, updateSession } from '../services/session-manager.js'
import { dispatchTask } from '../services/job-dispatcher.js'
import { uploadFromUrl } from '../services/minio-uploader.js'
import { RHV2Client } from '../../skills/runninghub/rh-v2-client.js'
import { SmartModelRouter } from '../services/smart-model-router.js'
import { FeedbackStore } from '../services/feedback-store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const debugLog = (...args) => { if (process.env.DEBUG) console.log(...args); }; // eslint-disable-line no-console

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const u = new URL(REDIS_URL)
const connection = { host: u.hostname, port: parseInt(u.port || '6379') }

const RH_API_KEY = process.env.RH_API_KEY || ''
const RH_API_BASE_URL = process.env.RH_API_BASE_URL || 'https://www.runninghub.cn/openapi/v2'

let smartRouter = null
try {
  const registryPath = resolve(__dirname, '../../skills/runninghub/developer-kit/developer-kit/model-registry.public.json')
  const pricingPath = resolve(__dirname, '../../skills/runninghub/developer-kit/developer-kit/pricing.public.json')
  smartRouter = new SmartModelRouter(registryPath, pricingPath, null)
  await smartRouter.init()
  debugLog(`[gen-worker] SmartModelRouter initialized with ${smartRouter.models?.length || 0} models`)
} catch (e) {
  console.warn(`[gen-worker] SmartModelRouter init failed: ${e.message}`)
}

let feedbackStore = null
try {
  const Redis = (await import('ioredis')).default
  const redisClient = new Redis(REDIS_URL)
  feedbackStore = new FeedbackStore(redisClient)
  debugLog('[gen-worker] FeedbackStore initialized')
} catch (e) {
  console.warn(`[gen-worker] FeedbackStore init failed: ${e.message}`)
}

let modelRegistry = []
try {
  const registryPath = resolve(__dirname, '../../skills/runninghub/developer-kit/developer-kit/model-registry.public.json')
  modelRegistry = JSON.parse(readFileSync(registryPath, 'utf-8'))
  const count = Array.isArray(modelRegistry) ? modelRegistry.length : (modelRegistry.model_count || 0)
  debugLog(`[gen-worker] loaded ${count} models from registry`)
} catch (e) {
  console.warn(`[gen-worker] failed to load model registry: ${e.message}`)
}

function lookupModel(endpoint) {
  const list = Array.isArray(modelRegistry) ? modelRegistry : (modelRegistry.models || [])
  return list.find(m => m.endpoint === endpoint) || null
}

function getInputFieldKeys(modelDef) {
  const imageKeys = []
  const videoKeys = []
  const audioKeys = []
  const params = modelDef?.params || []
  for (const p of params) {
    const key = p.fieldKey || p.fieldName
    if (!key) continue
    if (p.type === 'IMAGE') imageKeys.push(key)
    if (p.type === 'VIDEO') videoKeys.push(key)
    if (p.type === 'AUDIO') audioKeys.push(key)
  }
  return { imageKeys, videoKeys, audioKeys }
}

function detectHasMedia(files) {
  let hasImage = false
  let hasVideo = false
  for (const f of files || []) {
    const name = (f.name || f.url || '').toLowerCase()
    const mime = (f.mimetype || f.type || '').toLowerCase()
    if (mime.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp')) {
      hasImage = true
    }
    if (mime.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.avi') || name.endsWith('.webm')) {
      hasVideo = true
    }
  }
  return { hasImage, hasVideo }
}

async function generateViaV2(task, session) {
  const ctx = session.context || {}

  let endpoint = ctx.selectedModel?.endpoint || task.modelEndpoint
  if (!endpoint) {
    if (smartRouter) {
      try {
        const userText = (ctx.intent?.script || '') + ' ' + (session.history || []).map(m => m.content || '').join(' ')
        const smartResult = smartRouter.smartRecommend(userText, ctx.intent || {})
        if (smartResult.recommendations.length > 0) {
          endpoint = smartResult.recommendations[0].endpoint
          debugLog(`[gen-worker] auto-selected: ${endpoint} (${smartResult.recommendations[0].whyRecommended})`)
        }
      } catch (e) {
        debugLog(`[gen-worker] smart recommend failed: ${e.message}`)
      }
    }
    if (!endpoint) {
      throw new Error('未指定模型端点，无法生成视频')
    }
  }

  const modelDef = lookupModel(endpoint)

  ctx.selectedModel = {
    endpoint,
    params: ctx.selectedModel?.params || task.modelParams || {},
    fields: ctx.selectedModel?.fields || modelDef?.params || [],
    inputTypes: ctx.selectedModel?.inputTypes || (modelDef ? [...new Set((modelDef.params || []).map(p => p.type?.toLowerCase()).filter(Boolean))] : []),
    taskType: ctx.selectedModel?.taskType || '',
  }

  const sessionFiles = session.files || []
  const { hasImage: fileHasImage, hasVideo: fileHasVideo } = detectHasMedia(sessionFiles)
  const effectiveHasImage = ctx.intent?.hasImage || fileHasImage
  const effectiveHasVideo = ctx.intent?.hasVideo || fileHasVideo

  const client = new RHV2Client(RH_API_KEY, RH_API_BASE_URL)

  const localFiles = {}
  if ((effectiveHasImage || effectiveHasVideo) && sessionFiles.length > 0) {
    const { imageKeys, videoKeys } = getInputFieldKeys(modelDef)

    for (const file of sessionFiles) {
      let fileBuffer = file.buffer || (file.path && existsSync(file.path) ? readFileSync(file.path) : null)
      if (!fileBuffer && file.url) {
        try {
          const res = await fetch(file.url, { signal: AbortSignal.timeout(30000) })
          if (res.ok) {
            const ab = await res.arrayBuffer()
            fileBuffer = Buffer.from(ab)
            debugLog(`[gen-worker] downloaded file from URL: ${(fileBuffer.length / 1024).toFixed(1)}KB`)
          }
        } catch (e) {
          console.warn(`[gen-worker] failed to download file from URL: ${e.message}`)
        }
      }
      if (!fileBuffer || fileBuffer.length === 0) continue

      const name = (file.name || file.url || '').toLowerCase()
      const mime = (file.mimetype || file.type || '').toLowerCase()
      const isVideo = mime.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov')

      let fieldKey
      if (isVideo && videoKeys.length > 0) {
        fieldKey = videoKeys[0]
      } else if (!isVideo && imageKeys.length > 0) {
        fieldKey = imageKeys[0]
      } else if (videoKeys.length > 0) {
        fieldKey = videoKeys[0]
      } else if (imageKeys.length > 0) {
        fieldKey = imageKeys[0]
      } else {
        console.warn(`[gen-worker] no IMAGE/VIDEO field found in model ${endpoint}, skipping file upload`)
        continue
      }

      const filesList = localFiles[fieldKey] || []
      if (filesList.length === 0) {
        filesList.push({ buffer: fileBuffer, name: file.name || `upload.${isVideo ? 'mp4' : 'png'}` })
        localFiles[fieldKey] = filesList
        debugLog(`[gen-worker] mapped file to field "${fieldKey}" (isVideo=${isVideo})`)
      } else {
        debugLog(`[gen-worker] skipping file for field "${fieldKey}" (already mapped)`)
      }
    }
  }

  if (Object.keys(localFiles).length === 0 && sessionFiles.length > 0) {
    console.warn(`[gen-worker] WARNING: session has ${sessionFiles.length} files but none were mapped to model fields. Model ${endpoint} may not support image/video input.`)
  }

  const payload = buildV2Payload(ctx.selectedModel, localFiles, ctx)

  debugLog(`[gen-worker] V2 submitting to ${ctx.selectedModel.endpoint}, localFiles keys: ${Object.keys(localFiles).join(',') || 'none'}`)
  const result = await client.run(ctx.selectedModel.endpoint, payload, localFiles)
  debugLog(`[gen-worker] V2 task ${result.taskId} completed, outputs: ${result.outputs.length}`)

  return {
    videoUrl: result.outputs[0],
    rhTaskId: result.taskId,
    outputs: result.outputs,
    rawResponse: result.rawResponse,
  }
}

function buildV2Payload(selectedModel, localFiles, ctx) {
  const userParams = selectedModel.params || {}
  const payload = {}
  const intent = ctx?.intent || {}
  const script = intent.script || ctx?.script || ''

  const model = lookupModel(selectedModel.endpoint)
  const fields = model?.params || selectedModel.fields || []

  for (const field of fields) {
    const key = field.fieldKey || field.fieldName
    if (!key) continue

    if (userParams[key] !== undefined) {
      payload[key] = userParams[key]
    } else if (field.defaultValue !== undefined && field.defaultValue !== null) {
      payload[key] = field.defaultValue
    } else if (field.fieldValue !== undefined) {
      payload[key] = coerceValue(field, String(field.fieldValue ?? ''))
    }
  }

  if (script) {
    const promptKey = fields.find(f => {
      const k = (f.fieldKey || f.fieldName || '').toLowerCase()
      return k === 'prompt' || k.includes('prompt') || k.includes('text')
    })
    if (promptKey) {
      payload[promptKey.fieldKey || promptKey.fieldName] = script
    } else {
      payload.prompt = script
    }
  }

  for (const [fileKey] of Object.entries(localFiles)) {
    if (!payload[fileKey]) payload[fileKey] = ''
  }

  debugLog(`[gen-worker] buildV2Payload: ${Object.keys(payload).length} fields`, Object.keys(payload))
  return payload
}

function coerceValue(field, value) {
  if (field.fieldType === 'INT' || field.type === 'INT') return parseInt(value, 10)
  if (field.fieldType === 'FLOAT' || field.type === 'FLOAT') return parseFloat(value)
  if (field.fieldType === 'BOOLEAN' || field.type === 'BOOLEAN') return value === 'true' || value === true
  return String(value)
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

    const v2Result = await generateViaV2(task, session)
    let videoUrl = v2Result.videoUrl
    const rhTaskId = v2Result.rhTaskId
    const rhOutputs = v2Result.rawResponse
    debugLog(`[gen-worker] video generated: ${videoUrl}`)

    let minioUrl = null
    if (videoUrl) {
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
        status: 'AWAITING_REVIEW',
        videoUrl,
        rhTaskId: rhTaskId || undefined,
        rhApiVersion: 'v2',
        rhOutputs: rhOutputs || undefined,
        thumbnailUrl: videoUrl ? videoUrl.replace(/\.mp4(\?.*)?$/, '.jpg') : null,
      },
    })

    await updateSession(sessionId, { status: 'awaiting_review' })

    if (feedbackStore) {
      const successEndpoint = session?.context?.selectedModel?.endpoint || task.modelEndpoint
      if (successEndpoint) {
        feedbackStore.recordGeneration(successEndpoint, { status: 'SUCCESS' }).catch(() => {})
      }
    }

    const platforms = (await getSession(sessionId))?.context?.platforms || []
    const autoPublish = !!((await getSession(sessionId))?.context?.autoPublish)
    if (autoPublish && platforms.length > 0) {
      debugLog(`[gen-worker] auto-publish enabled, queuing publish for ${platforms.length} platforms`)
      await pubQueue.add('publish-all', {
        taskId,
        sessionId,
        platforms,
        videoUrl,
      }, { jobId: `pub-${taskId}` })
    } else {
      debugLog(`[gen-worker] awaiting user review before publish (platforms=${platforms.length})`)
    }

    return { taskId, status: 'AWAITING_REVIEW', videoUrl }
  } catch (e) {
    console.error(`[gen-worker] task ${taskId} failed:`, e.message)
    if (feedbackStore) {
      const failSession = await getSession(sessionId).catch(() => null)
      const failEndpoint = failSession?.context?.selectedModel?.endpoint || job.data.modelEndpoint
      if (failEndpoint) {
        feedbackStore.recordGeneration(failEndpoint, { status: 'FAILED' }).catch(() => {})
      }
    }
    await prisma.videoTask.update({
      where: { id: taskId },
      data: { status: 'FAILED', error: e.message, retryCount: { increment: 1 } },
    })
    await updateSession(sessionId, { status: 'failed' }).catch((ue) => {
      console.warn(`[gen-worker] failed to update session status: ${ue.message}`)
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

debugLog('[gen-worker] started (V2 only)')

const pubWorker = new Worker('publish', async (job) => {
  const { taskId, sessionId, platforms, videoUrl } = job.data
  debugLog(`[pub-worker] starting publish for task ${taskId}`)

  if (!platforms || platforms.length === 0) {
    debugLog(`[pub-worker] task ${taskId}: no platforms configured, skipping publish (stays at GENERATED)`)
    return { taskId, status: 'GENERATED', publishedTo: [] }
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

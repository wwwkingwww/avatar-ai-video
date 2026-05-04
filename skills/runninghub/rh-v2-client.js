const RH_BASE_URL = process.env.RH_API_BASE_URL || 'https://www.runninghub.cn/openapi/v2'

const NON_TERMINAL_STATUSES = new Set(['CREATE', 'QUEUED', 'RUNNING'])
const SUCCESS_STATUS = 'SUCCESS'
const FAILURE_STATUSES = new Set(['FAILED', 'CANCEL'])

async function retryFetch(fn, maxRetries = 3) {
  let lastError
  for (let i = 0; i < maxRetries; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, Math.min(2 ** i, 15) * 1000))
    try {
      return await fn()
    } catch (e) {
      lastError = e
      if (e.statusCode !== 429 && e.statusCode < 500) throw e
    }
  }
  throw lastError
}

class RHV2Error extends Error {
  constructor(message, statusCode) {
    super(message)
    this.name = 'RHV2Error'
    this.statusCode = statusCode
  }
}

export class RHV2Client {
  constructor(apiKey, baseUrl = RH_BASE_URL) {
    if (!apiKey) throw new RHV2Error('RH_API_KEY is required for V2 client')
    this.apiKey = apiKey
    this.baseUrl = baseUrl
  }

  _headers(contentType) {
    const h = { Authorization: `Bearer ${this.apiKey}` }
    if (contentType) {
      if (contentType.startsWith('multipart/')) {
        h['Content-Type'] = contentType
      } else {
        h['Content-Type'] = contentType
      }
    }
    return h
  }

  async _fetch(method, path, opts = {}) {
    const { body, contentType, isMultipart } = opts
    const url = `${this.baseUrl}${path}`
    const fetchOpts = { method, headers: this._headers(isMultipart ? undefined : (contentType || 'application/json')) }

    if (body) {
      if (isMultipart) {
        delete fetchOpts.headers['Content-Type']
        fetchOpts.body = body
      } else {
        fetchOpts.body = JSON.stringify(body)
      }
    }

    const res = await fetch(url, fetchOpts)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const err = new RHV2Error(`RH V2 HTTP ${res.status} ${method} ${path}: ${text.substring(0, 300)}`, res.status)
      throw err
    }

    const data = await res.json()
    return data
  }

  async uploadFile(fileBuffer, fileName) {
    const boundary = `----rh-${Date.now()}`
    const mimeType = fileName.endsWith('.png') ? 'image/png' :
      fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') ? 'image/jpeg' :
        fileName.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream'

    const parts = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`,
      `Content-Type: ${mimeType}\r\n\r\n`,
    ]
    const head = new Uint8Array(parts.map((p) => new TextEncoder().encode(p)).reduce((a, b) => {
      const c = new Uint8Array(a.length + b.length)
      c.set(a, 0)
      c.set(b, a.length)
      return c
    }))
    const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`)
    const fileBuf = typeof fileBuffer === 'string' ?
      new TextEncoder().encode(fileBuffer) :
      fileBuffer
    const fullBody = new Uint8Array(head.length + fileBuf.length + tail.length)
    fullBody.set(head, 0)
    fullBody.set(fileBuf, head.length)
    fullBody.set(tail, head.length + fileBuf.length)

    const data = await retryFetch(() =>
      this._fetch('POST', '/media/upload/binary', {
        body: fullBody,
        isMultipart: true,
      })
    )

    if (data.code !== 0) {
      throw new RHV2Error(`Upload failed: ${data.msg || 'unknown'}`, 400)
    }

    const downloadUrl = (data.data?.download_url || '').trim()
    if (!downloadUrl) throw new RHV2Error('Upload failed: missing data.download_url')
    return downloadUrl
  }

  async submit(endpoint, payload) {
    if (!endpoint || endpoint.startsWith('/')) {
      throw new RHV2Error('Endpoint must be a relative path without leading slash')
    }

    const data = await retryFetch(() =>
      this._fetch('POST', `/${endpoint}`, { body: payload })
    )

    const errorCode = data.errorCode || data.error_code
    const errorMsg = data.errorMessage || data.error_message
    if (errorCode || errorMsg) {
      throw new RHV2Error(`Submit failed: ${errorMsg || errorCode}`, 400)
    }

    const taskId = data.taskId || data.task_id
    if (!taskId) {
      throw new RHV2Error(`Submit failed: missing taskId in response: ${JSON.stringify(data).substring(0, 200)}`)
    }
    return String(taskId)
  }

  async query(taskId) {
    const data = await this._fetch('POST', '/query', { body: { taskId } })

    const errorCode = data.errorCode || data.error_code
    const errorMsg = data.errorMessage || data.error_message
    if (errorCode || errorMsg) {
      throw new RHV2Error(`Task failed: ${errorMsg || errorCode} [taskId=${taskId}]`)
    }

    const status = String(data.status || '').trim().toUpperCase()
    if (status === SUCCESS_STATUS) {
      return data
    }
    if (FAILURE_STATUSES.has(status)) {
      throw new RHV2Error(`Task ended with status=${status} [taskId=${taskId}]`)
    }
    if (!NON_TERMINAL_STATUSES.has(status)) {
      throw new RHV2Error(`Unknown task status=${status} [taskId=${taskId}]`)
    }
    return null
  }

  async pollTask(taskId, timeoutMs = 10 * 60 * 1000, intervalMs = 5000) {
    const deadline = Date.now() + timeoutMs
    let consecutiveFailures = 0

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, intervalMs))

      try {
        const data = await this.query(taskId)
        consecutiveFailures = 0
        if (data) {
          return { status: 'SUCCESS', data }
        }
      } catch (e) {
        consecutiveFailures++
        if (consecutiveFailures >= 5 || !(e instanceof RHV2Error)) {
          throw e
        }
        await new Promise((r) => setTimeout(r, Math.min(consecutiveFailures * 2, 10) * 1000))
      }
    }

    throw new RHV2Error(`Task ${taskId} timed out after ${timeoutMs / 60000}min`)
  }

  async run(endpoint, payload, localFiles) {
    const preparedPayload = { ...payload }

    if (localFiles) {
      for (const [key, files] of Object.entries(localFiles)) {
        const fileList = Array.isArray(files) ? files : [files]
        const urls = []
        for (const file of fileList) {
          const buffer = typeof file === 'string' ? file : file.buffer
          const name = file.name || 'upload'
          const url = await this.uploadFile(buffer, name)
          urls.push(url)
        }
        preparedPayload[key] = fileList.length === 1 ? urls[0] : urls
      }
    }

    const taskId = await this.submit(endpoint, preparedPayload)
    const result = await this.pollTask(taskId)
    return { taskId, outputs: extractOutputs(result.data), rawResponse: result.data }
  }

  async getWorkflowNodes(webappId) {
    const data = await retryFetch(() =>
      this._fetch('GET', `/task/openapi/nodes?webappId=${encodeURIComponent(webappId)}`)
    )

    const nodes = data.nodeInfoList || data.nodes || data.data
    if (!nodes || !Array.isArray(nodes)) {
      throw new RHV2Error(`getWorkflowNodes: unexpected response for webappId=${webappId}`)
    }
    return nodes
  }

  async submitWorkflow(webappId, nodeInfoList) {
    const data = await retryFetch(() =>
      this._fetch('POST', '/task/openapi/ai-app/run', {
        body: { webappId, nodeInfoList },
      })
    )

    const errorCode = data.errorCode || data.error_code
    const errorMsg = data.errorMessage || data.error_message
    if (errorCode || errorMsg) {
      throw new RHV2Error(`Workflow submit failed: ${errorMsg || errorCode}`, 400)
    }

    const taskId = data.taskId || data.task_id || (data.data && (data.data.taskId || data.data.task_id))
    if (!taskId) {
      throw new RHV2Error(`Workflow submit failed: missing taskId in response: ${JSON.stringify(data).substring(0, 200)}`)
    }
    return String(taskId)
  }

  async queryWorkflowOutputs(taskId) {
    const data = await this._fetch('POST', '/task/openapi/outputs', { body: { taskId } })

    const errorCode = data.errorCode || data.error_code
    const errorMsg = data.errorMessage || data.error_message
    if (errorCode || errorMsg) {
      throw new RHV2Error(`Workflow task failed: ${errorMsg || errorCode} [taskId=${taskId}]`)
    }

    const status = String(data.status || (data.data && data.data.status) || '').trim().toUpperCase()
    if (status === SUCCESS_STATUS) {
      return data
    }
    if (FAILURE_STATUSES.has(status)) {
      throw new RHV2Error(`Workflow task ended with status=${status} [taskId=${taskId}]`)
    }
    if (!NON_TERMINAL_STATUSES.has(status)) {
      throw new RHV2Error(`Unknown workflow task status=${status} [taskId=${taskId}]`)
    }
    return null
  }

  async pollWorkflowTask(taskId, timeoutMs = 10 * 60 * 1000, intervalMs = 5000) {
    const deadline = Date.now() + timeoutMs
    let consecutiveFailures = 0

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, intervalMs))

      try {
        const data = await this.queryWorkflowOutputs(taskId)
        consecutiveFailures = 0
        if (data) {
          return { status: 'SUCCESS', data }
        }
      } catch (e) {
        consecutiveFailures++
        if (consecutiveFailures >= 5 || !(e instanceof RHV2Error)) {
          throw e
        }
        await new Promise((r) => setTimeout(r, Math.min(consecutiveFailures * 2, 10) * 1000))
      }
    }

    throw new RHV2Error(`Workflow task ${taskId} timed out after ${timeoutMs / 60000}min`)
  }

  async runWorkflow(webappId, nodeInfoList, localFiles) {
    const processedNodeList = nodeInfoList.map((n) => ({ ...n, fieldValue: String(n.fieldValue ?? '') }))

    if (localFiles) {
      for (const [nodeIdFieldName, files] of Object.entries(localFiles)) {
        const fileList = Array.isArray(files) ? files : [files]
        const urls = []
        for (const file of fileList) {
          const buffer = typeof file === 'string' ? file : file.buffer
          const name = file.name || 'upload'
          const url = await this.uploadFile(buffer, name)
          urls.push(url)
        }

        const [nodeId, fieldName] = nodeIdFieldName.split(':')
        const targetNode = processedNodeList.find((n) => n.nodeId === nodeId && n.fieldName === fieldName)
        if (targetNode) {
          targetNode.fieldValue = fileList.length === 1 ? urls[0] : urls.join(',')
        }
      }
    }

    const taskId = await this.submitWorkflow(webappId, processedNodeList)
    const result = await this.pollWorkflowTask(taskId)
    return { taskId, outputs: extractWorkflowOutputs(result.data), rawResponse: result.data }
  }
}

export function parseNodeInfoList(model, params, uploads) {
  if (!model || !model.fields) return []
  return model.fields.map((field) => {
    const overrideKey = `${field.nodeId}:${field.fieldName}`
    const uploaded = uploads && uploads[overrideKey]
    return {
      nodeId: field.nodeId,
      fieldName: field.fieldName,
      fieldValue: uploaded ? String(uploaded.fileName) : String(params[field.fieldName] ?? field.fieldValue ?? ''),
    }
  })
}

export function extractOutputs(response) {
  const results = response.results || []
  const outputs = []
  for (const item of results) {
    if (!item || typeof item !== 'object') continue
    const value = item.url || item.outputUrl || item.text || item.content || item.output
    if (value) outputs.push(String(value))
  }
  if (outputs.length === 0) {
    throw new RHV2Error('No outputs found in final response')
  }
  return outputs
}

export function extractWorkflowOutputs(response) {
  const outputs = response.outputs || response.data?.outputs || []
  if (Array.isArray(outputs) && outputs.length > 0) {
    if (typeof outputs[0] === 'string') return outputs.map(String)
    return outputs.map((item) => {
      if (typeof item === 'string') return item
      return item.url || item.outputUrl || item.videoUrl || item.imageUrl || item.fileUrl || ''
    }).filter(Boolean)
  }

  const results = response.results || response.data?.results || []
  if (results.length > 0) {
    return results.map((item) => {
      if (!item || typeof item !== 'object') return ''
      return item.url || item.outputUrl || item.videoUrl || item.text || item.content || item.output || ''
    }).filter(Boolean)
  }

  const flatUrls = []
  const findUrls = (obj) => {
    if (!obj || typeof obj !== 'object') return
    if (obj.url || obj.videoUrl || obj.imageUrl) {
      flatUrls.push(obj.url || obj.videoUrl || obj.imageUrl)
    }
    Object.values(obj).forEach((v) => { if (typeof v === 'object') findUrls(v) })
  }
  findUrls(response)
  if (flatUrls.length > 0) return flatUrls

  throw new RHV2Error('No outputs found in workflow response')
}

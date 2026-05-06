import { RHV2Client } from '../rh-v2-client.js'
import { failResult, buildPayload, validateRequired } from './utils.js'

const API_KEY = () => process.env.RH_API_KEY
const API_BASE = () => process.env.RH_API_BASE_URL || 'https://www.runninghub.cn/openapi/v2'

function getClient(apiKey) {
  const key = apiKey || API_KEY()
  if (!key) throw new Error('RH_API_KEY 未配置')
  return new RHV2Client(key, API_BASE())
}

function normalizeNodeInfoList(raw) {
  if (!raw || !Array.isArray(raw)) return []
  return raw.map((n) => ({
    nodeId: String(n.nodeId ?? ''),
    fieldName: String(n.fieldName ?? ''),
    fieldValue: String(n.fieldValue ?? ''),
  }))
}

function applyOverrides(nodeInfoList, overrides = {}) {
  return nodeInfoList.map((n) => {
    const key = `${n.nodeId}:${n.fieldName}`
    if (key in overrides) {
      return { ...n, fieldValue: String(overrides[key] ?? '') }
    }
    return n
  })
}

function overridesToNodeInfoList(overrides = {}) {
  const list = []
  for (const [key, value] of Object.entries(overrides)) {
    const [nodeId, fieldName] = key.split(':')
    if (nodeId && fieldName) {
      list.push({ nodeId, fieldName, fieldValue: String(value ?? '') })
    }
  }
  return list
}

/**
 * 直接运行工作流（传入完整 nodeInfoList）
 *
 * @param {Object} opts
 * @param {string} opts.webappId - 工作流应用 ID
 * @param {Array<{ nodeId: string, fieldName: string, fieldValue: string }>} opts.nodeInfoList
 * @param {Object} [opts.files] - 待上传文件 { 'nodeId:fieldName': file | file[] }
 * @param {number} [opts.timeout] - 超时毫秒，默认 10 分钟
 * @param {string} [opts.apiKey]
 * @returns {Promise<import('./types.js').ToolResult>}
 */
export async function run({ webappId, nodeInfoList, files, timeout, apiKey }) {
  if (!webappId) return failResult('', new Error('webappId 是必填参数'))

  const client = getClient(apiKey)
  const processed = normalizeNodeInfoList(nodeInfoList)

  try {
    const result = await client.runWorkflow(webappId, processed, files, { timeoutMs: timeout })
    return {
      success: true,
      taskId: result.taskId,
      outputs: result.outputs,
      rawResponse: result.rawResponse,
    }
  } catch (error) {
    return failResult('', error)
  }
}

/**
 * 使用预设参数运行工作流 — 自动获取节点 schema 并合并预设值
 *
 * @param {Object} opts
 * @param {string} opts.webappId - 工作流应用 ID
 * @param {Object} [opts.presets] - 预设参数 { 'nodeId:fieldName': value }
 * @param {Object} [opts.overrides] - 运行时覆盖 { 'nodeId:fieldName': value }
 * @param {Object} [opts.files]
 * @param {number} [opts.timeout]
 * @param {string} [opts.apiKey]
 * @returns {Promise<import('./types.js').ToolResult>}
 */
export async function runWithPreset({ webappId, presets = {}, overrides = {}, files, timeout, apiKey }) {
  if (!webappId) return failResult('', new Error('webappId 是必填参数'))

  const client = getClient(apiKey)

  try {
    const nodes = await client.getWorkflowNodes(webappId)
    const nodeInfoList = normalizeNodeInfoList(nodes)

    const merged = { ...presets, ...overrides }
    if (Object.keys(merged).length > 0) {
      applyOverrides(nodeInfoList, merged)
    }

    const result = await client.runWorkflow(webappId, nodeInfoList, files, { timeoutMs: timeout })
    return {
      success: true,
      taskId: result.taskId,
      outputs: result.outputs,
      rawResponse: result.rawResponse,
    }
  } catch (error) {
    return failResult('', error)
  }
}

/**
 * 获取工作流节点定义
 *
 * @param {Object} opts
 * @param {string} opts.webappId
 * @param {string} [opts.apiKey]
 * @returns {Promise<{ success: boolean, nodes: Array, error?: string }>}
 */
export async function getNodes({ webappId, apiKey }) {
  const client = getClient(apiKey)

  try {
    const nodes = await client.getWorkflowNodes(webappId)
    return { success: true, nodes }
  } catch (error) {
    return { success: false, nodes: [], error: error.message }
  }
}

/**
 * 仅提交工作流，不等待结果
 *
 * @param {Object} opts
 * @param {string} opts.webappId
 * @param {Array} opts.nodeInfoList
 * @param {Object} [opts.overrides]
 * @param {string} [opts.apiKey]
 * @returns {Promise<{ success: boolean, taskId: string, error?: string }>}
 */
export async function submit({ webappId, nodeInfoList, overrides, apiKey }) {
  const client = getClient(apiKey)

  try {
    let processed = normalizeNodeInfoList(nodeInfoList)
    if (overrides) {
      processed = applyOverrides(processed, overrides)
    }

    const taskId = await client.submitWorkflow(webappId, processed)
    return { success: true, taskId }
  } catch (error) {
    return { success: false, taskId: '', error: error.message }
  }
}

/**
 * 轮询工作流任务直到完成
 *
 * @param {Object} opts
 * @param {string} opts.taskId
 * @param {number} [opts.timeout]
 * @param {number} [opts.interval]
 * @param {string} [opts.apiKey]
 * @returns {Promise<import('./types.js').ToolResult>}
 */
export async function poll({ taskId, timeout, interval, apiKey }) {
  const client = getClient(apiKey)

  try {
    const result = await client.pollWorkflowTask(taskId, timeout, interval)
    const { extractWorkflowOutputs } = await import('../rh-v2-client.js')
    return {
      success: true,
      taskId,
      outputs: extractWorkflowOutputs(result.data),
      rawResponse: result.data,
    }
  } catch (error) {
    return failResult(taskId, error)
  }
}

export { buildPayload, validateRequired }

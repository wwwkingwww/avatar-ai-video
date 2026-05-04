import { RHV2Client } from '../rh-v2-client.js'
import { failResult } from './utils.js'

const API_KEY = () => process.env.RH_API_KEY
const API_BASE = () => process.env.RH_API_BASE_URL || 'https://www.runninghub.cn/openapi/v2'

function getClient(apiKey) {
  const key = apiKey || API_KEY()
  if (!key) throw new Error('RH_API_KEY 未配置')
  return new RHV2Client(key, API_BASE())
}

/**
 * 调用 RunningHub 应用 API（标准模型）
 *
 * @param {Object} opts
 * @param {string} opts.endpoint - 模型端点路径，如 'wan-2.7/text-to-image'
 * @param {Object} opts.payload - 请求参数
 * @param {Object} [opts.files] - 待上传文件 { fieldKey: file | file[] }
 * @param {number} [opts.timeout] - 超时毫秒，默认 10 分钟
 * @param {string} [opts.apiKey] - API Key，不传则读环境变量 RH_API_KEY
 * @returns {Promise<import('./types.js').ToolResult>}
 */
export async function run({ endpoint, payload, files, timeout, apiKey }) {
  const client = getClient(apiKey)

  try {
    const result = await client.run(endpoint, payload, files, { timeoutMs: timeout })
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
 * 仅提交任务，不等待结果
 *
 * @param {Object} opts
 * @param {string} opts.endpoint - 模型端点路径
 * @param {Object} opts.payload - 请求参数
 * @param {string} [opts.apiKey]
 * @returns {Promise<{ success: boolean, taskId: string, error?: string }>}
 */
export async function submit({ endpoint, payload, apiKey }) {
  const client = getClient(apiKey)

  try {
    const taskId = await client.submit(endpoint, payload)
    return { success: true, taskId }
  } catch (error) {
    return { success: false, taskId: '', error: error.message }
  }
}

/**
 * 轮询任务直到完成
 *
 * @param {Object} opts
 * @param {string} opts.taskId
 * @param {number} [opts.timeout] - 超时毫秒
 * @param {number} [opts.interval] - 轮询间隔毫秒
 * @param {string} [opts.apiKey]
 * @returns {Promise<import('./types.js').ToolResult>}
 */
export async function poll({ taskId, timeout, interval, apiKey }) {
  const client = getClient(apiKey)

  try {
    const result = await client.pollTask(taskId, timeout, interval)
    const { extractOutputs } = await import('../rh-v2-client.js')
    return {
      success: true,
      taskId,
      outputs: extractOutputs(result.data),
      rawResponse: result.data,
    }
  } catch (error) {
    return failResult(taskId, error)
  }
}

/**
 * 上传文件并返回下载 URL
 *
 * @param {Object} opts
 * @param {Buffer|string} opts.file - 文件 buffer 或内容字符串
 * @param {string} opts.fileName - 文件名
 * @param {string} [opts.apiKey]
 * @returns {Promise<{ success: boolean, downloadUrl: string, error?: string }>}
 */
export async function upload({ file, fileName, apiKey }) {
  const client = getClient(apiKey)

  try {
    const url = await client.uploadFile(file, fileName)
    return { success: true, downloadUrl: url }
  } catch (error) {
    return { success: false, downloadUrl: '', error: error.message }
  }
}

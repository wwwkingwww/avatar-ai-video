/**
 * @typedef {Object} ToolResult
 * @property {boolean} success
 * @property {string} taskId
 * @property {string[]} outputs
 * @property {Object} rawResponse
 * @property {string} [error]
 */

export const ERROR_CODES = {
  AUTH_FAILED: 'AUTH_FAILED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INVALID_PARAM: 'INVALID_PARAM',
  CONTENT_POLICY: 'CONTENT_POLICY',
  NETWORK_ERROR: 'NETWORK_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  TASK_TIMEOUT: 'TASK_TIMEOUT',
  TASK_FAILED: 'TASK_FAILED',
  UNKNOWN: 'UNKNOWN',
}

export const ERROR_META = {
  [ERROR_CODES.AUTH_FAILED]: { retryable: false, message: 'API Key 无效或过期' },
  [ERROR_CODES.INSUFFICIENT_BALANCE]: { retryable: false, message: '账户余额不足' },
  [ERROR_CODES.INVALID_PARAM]: { retryable: false, message: '参数校验失败' },
  [ERROR_CODES.CONTENT_POLICY]: { retryable: false, message: '内容审核不通过' },
  [ERROR_CODES.NETWORK_ERROR]: { retryable: true, message: '网络请求失败' },
  [ERROR_CODES.RATE_LIMITED]: { retryable: true, message: '请求频率过高' },
  [ERROR_CODES.TASK_TIMEOUT]: { retryable: false, message: '任务执行超时' },
  [ERROR_CODES.TASK_FAILED]: { retryable: false, message: '任务执行失败' },
  [ERROR_CODES.UNKNOWN]: { retryable: false, message: '未知错误' },
}

export const FIELD_TYPES = {
  STRING: 'STRING',
  LIST: 'LIST',
  ENUM: 'ENUM',
  BOOLEAN: 'BOOLEAN',
  INT: 'INT',
  FLOAT: 'FLOAT',
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
  AUDIO: 'AUDIO',
}

export const MEDIA_FIELD_NAMES = new Set([
  'imageUrl', 'imageUrls', 'image',
  'videoUrl', 'videoUrls', 'video',
  'audioUrl', 'audioUrls', 'audio',
  'fileUrl', 'fileUrls',
])

import { ERROR_CODES, ERROR_META, FIELD_TYPES, MEDIA_FIELD_NAMES } from './types.js'

export function classifyError(error) {
  const msg = (error.message || '').toLowerCase()
  const statusCode = error.statusCode || 0

  if (statusCode === 401 || statusCode === 403 || msg.includes('unauthorized') || msg.includes('forbidden')) {
    return { code: ERROR_CODES.AUTH_FAILED, ...ERROR_META[ERROR_CODES.AUTH_FAILED] }
  }
  if (msg.includes('balance') || msg.includes('quota') || msg.includes('insufficient') || msg.includes('余额')) {
    return { code: ERROR_CODES.INSUFFICIENT_BALANCE, ...ERROR_META[ERROR_CODES.INSUFFICIENT_BALANCE] }
  }
  if (statusCode === 400 || msg.includes('invalid') || msg.includes('parameter') || msg.includes('required')) {
    return { code: ERROR_CODES.INVALID_PARAM, ...ERROR_META[ERROR_CODES.INVALID_PARAM] }
  }
  if (msg.includes('policy') || msg.includes('moderation') || msg.includes('nsfw') || msg.includes('violation') || msg.includes('forbidden content')) {
    return { code: ERROR_CODES.CONTENT_POLICY, ...ERROR_META[ERROR_CODES.CONTENT_POLICY] }
  }
  if (statusCode === 429 || msg.includes('rate')) {
    return { code: ERROR_CODES.RATE_LIMITED, ...ERROR_META[ERROR_CODES.RATE_LIMITED] }
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return { code: ERROR_CODES.TASK_TIMEOUT, ...ERROR_META[ERROR_CODES.TASK_TIMEOUT] }
  }
  if (msg.includes('failed') || msg.includes('cancel')) {
    return { code: ERROR_CODES.TASK_FAILED, ...ERROR_META[ERROR_CODES.TASK_FAILED] }
  }
  if (statusCode >= 500 || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('fetch failed')) {
    return { code: ERROR_CODES.NETWORK_ERROR, ...ERROR_META[ERROR_CODES.NETWORK_ERROR] }
  }
  return { code: ERROR_CODES.UNKNOWN, ...ERROR_META[ERROR_CODES.UNKNOWN] }
}

export function coerceValue(fieldType, value) {
  if (value === undefined || value === null) return ''
  switch (fieldType) {
    case FIELD_TYPES.INT:
      return parseInt(value, 10)
    case FIELD_TYPES.FLOAT:
      return parseFloat(value)
    case FIELD_TYPES.BOOLEAN:
      if (typeof value === 'boolean') return value
      return value === 'true' || value === true
    case FIELD_TYPES.LIST:
    case FIELD_TYPES.ENUM:
      return String(value)
    case FIELD_TYPES.IMAGE:
    case FIELD_TYPES.VIDEO:
    case FIELD_TYPES.AUDIO:
    default:
      return String(value)
  }
}

export function buildPayload(fields, params = {}) {
  const payload = {}
  for (const field of fields) {
    const key = field.fieldName || field.fieldKey
    if (!key) continue

    const fieldType = field.fieldType || field.type || FIELD_TYPES.STRING

    if (params[key] !== undefined) {
      payload[key] = coerceValue(fieldType, params[key])
    } else if (field.fieldValue !== undefined && field.fieldValue !== '') {
      payload[key] = coerceValue(fieldType, field.fieldValue)
    }
  }
  return payload
}

export function validateRequired(fields, params = {}) {
  const missing = []
  for (const field of fields) {
    if (!field.required) continue
    const key = field.fieldName || field.fieldKey
    if (!key) continue

    const value = params[key]
    if (value === undefined || value === null || value === '') {
      missing.push(key)
    }
  }
  return missing
}

export function normalizeFileInput(file) {
  if (!file) return null

  if (Buffer.isBuffer(file)) {
    return { buffer: file, name: 'upload.bin' }
  }

  if (typeof file === 'string') {
    return { buffer: file, name: 'upload' }
  }

  if (file.buffer) {
    return { buffer: file.buffer, name: file.name || 'upload' }
  }

  return null
}

export function isMediaField(fieldName) {
  if (!fieldName) return false
  return MEDIA_FIELD_NAMES.has(fieldName)
}

export function failResult(taskId, error) {
  const classified = classifyError(error)
  return {
    success: false,
    taskId: taskId || '',
    outputs: [],
    rawResponse: null,
    error: error.message || String(error),
    errorCode: classified.code,
    errorMessage: classified.message,
    retryable: classified.retryable,
  }
}

export const TOPICS = {
  TASK: (phoneId) => `phone/${phoneId}/task`,
  STATUS: (phoneId) => `phone/${phoneId}/status`,
  HEARTBEAT: (phoneId) => `phone/${phoneId}/heartbeat`,
  CMD: (phoneId) => `phone/${phoneId}/cmd`,
};

export const TASK_STATUS = {
  DOWNLOADING: 'downloading',
  PUBLISHING: 'publishing',
  SUCCESS: 'success',
  FAILED: 'failed',
};

export const PLATFORMS = ['douyin', 'kuaishou', 'xiaohongshu'];

export const ACTION_TYPES = [
  'launch',
  'tap',
  'swipe',
  'wait',
  'input_text',
  'screenshot',
  'back',
  'home',
];

export function validateTaskPayload(payload) {
  if (!payload.task_id || typeof payload.task_id !== 'string') {
    return { valid: false, error: '缺少 task_id' };
  }
  if (!payload.platform || !PLATFORMS.includes(payload.platform)) {
    return { valid: false, error: `平台必须是 ${PLATFORMS.join('/')} 之一` };
  }
  if (!payload.video || !payload.video.url) {
    return { valid: false, error: '缺少 video.url' };
  }
  if (!Array.isArray(payload.actions) || payload.actions.length === 0) {
    return { valid: false, error: 'actions 必须是非空数组' };
  }
  for (let i = 0; i < payload.actions.length; i++) {
    const action = payload.actions[i];
    if (!ACTION_TYPES.includes(action.type)) {
      return { valid: false, error: `actions[${i}].type "${action.type}" 无效` };
    }
  }
  return { valid: true };
}

export function validateStatusPayload(payload) {
  if (!payload.task_id) return { valid: false, error: '缺少 task_id' };
  if (!payload.phone_id) return { valid: false, error: '缺少 phone_id' };
  if (!Object.values(TASK_STATUS).includes(payload.status)) {
    return { valid: false, error: `status 必须是 ${Object.values(TASK_STATUS).join('/')} 之一` };
  }
  return { valid: true };
}

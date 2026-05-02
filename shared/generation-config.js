// 统一生成配置：creator-api 和 creator-frontend 共同使用
// 新增能力只需在这里加一行，前后端自动同步

const TEMPLATES = {
  'talking-head': { label: '口播讲解', desc: '人物出镜口播', icon: '🎙️' },
  'tech-review':  { label: '科技评测', desc: '数码产品开箱', icon: '🔧' },
  'product-showcase': { label: '产品展示', desc: '商品细节展现', icon: '🛍️' },
  'vlog':         { label: '日常Vlog', desc: '生活记录风格', icon: '📸' },
}

const PLATFORMS = {
  douyin:       { label: '抖音',   icon: '🎵', color: '#111' },
  kuaishou:     { label: '快手',   icon: '🎬', color: '#ff5722' },
  xiaohongshu:  { label: '小红书', icon: '📕', color: '#fe2c55' },
}

const TASK_TYPES = {
  'text-to-video': { label: '文生视频', desc: '输入文案生成视频', icon: '📝→🎬' },
  'image-to-video': { label: '图生视频', desc: '上传图片生成视频', icon: '🖼️→🎬' },
  'text-to-image': { label: '文生图', desc: '输入文案生成图片', icon: '📝→🖼️' },
  'video-to-video': { label: '视频编辑', desc: '上传视频进行风格转换', icon: '🎬→🎬' },
}

const PHASES = ['INTENT', 'PARAMS', 'RECOMMEND', 'CONFIRM']

export const TEMPLATE_IDS = Object.keys(TEMPLATES)
export const PLATFORM_IDS = Object.keys(PLATFORMS)
export const TASK_TYPE_IDS = Object.keys(TASK_TYPES)

export function templateLabel(id) { return TEMPLATES[id]?.label || id }
export function platformLabel(id) { return PLATFORMS[id]?.label || id }
export function platformInfo(id) { return PLATFORMS[id] || { label: id, icon: '📱', color: '#333' } }
export function taskTypeInfo(id) { return TASK_TYPES[id] || { label: id, icon: '🎬' } }

export function templateList() { return Object.entries(TEMPLATES).map(([id, t]) => ({ id, ...t })) }
export function platformList() { return Object.entries(PLATFORMS).map(([id, p]) => ({ id, ...p })) }
export function taskTypeList() { return Object.entries(TASK_TYPES).map(([id, t]) => ({ id, ...t })) }

export function templateOptions() { return TEMPLATE_IDS.map(id => TEMPLATES[id].label).join(' | ') }
export function platformOptions() { return PLATFORM_IDS.map(id => `${PLATFORMS[id].icon} ${PLATFORMS[id].label}`).join(' | ') }
export function taskTypeOptions() { return TASK_TYPE_IDS.map(id => `${TASK_TYPES[id].icon} ${TASK_TYPES[id].label}`).join(' | ') }

export { TEMPLATES, PLATFORMS, TASK_TYPES, PHASES }

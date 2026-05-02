// 统一模板和平台配置：前端/后端共享，避免硬编码
export const TEMPLATES = {
  'talking-head': { label: '口播讲解', desc: '人物出镜口播', icon: '🎙️' },
  'tech-review':  { label: '科技评测', desc: '数码产品开箱', icon: '🔧' },
  'product-showcase': { label: '产品展示', desc: '商品细节展现', icon: '🛍️' },
  'vlog':         { label: '日常Vlog', desc: '生活记录风格', icon: '📸' },
} as const

export const PLATFORMS = {
  douyin:       { label: '抖音',   icon: '🎵', color: '#111' },
  kuaishou:     { label: '快手',   icon: '🎬', color: '#ff5722' },
  xiaohongshu:  { label: '小红书', icon: '📕', color: '#fe2c55' },
} as const

export type TemplateId = keyof typeof TEMPLATES
export type PlatformId = keyof typeof PLATFORMS

export const TASK_TYPES = {
  'text-to-video': { label: '文生视频', desc: '输入文案生成视频', icon: '📝→🎬' },
  'image-to-video': { label: '图生视频', desc: '上传图片生成视频', icon: '🖼️→🎬' },
  'text-to-image': { label: '文生图', desc: '输入文案生成图片', icon: '📝→🖼️' },
  'video-to-video': { label: '视频编辑', desc: '上传视频进行风格转换', icon: '🎬→🎬' },
} as const

export type TaskTypeId = keyof typeof TASK_TYPES

export const TASK_TYPE_IDS: TaskTypeId[] = Object.keys(TASK_TYPES) as TaskTypeId[]

export function taskTypeInfo(id: string): { label: string; icon: string } {
  return TASK_TYPES[id as TaskTypeId] || { label: id, icon: '🎬' }
}

export const TEMPLATE_IDS: TemplateId[] = Object.keys(TEMPLATES) as TemplateId[]
export const PLATFORM_IDS: PlatformId[] = Object.keys(PLATFORMS) as PlatformId[]

export function templateLabel(id: string): string {
  return TEMPLATES[id as TemplateId]?.label || id
}

export function platformLabel(id: string): string {
  return PLATFORMS[id as PlatformId]?.label || id
}

export function templateOptions(): string {
  return TEMPLATE_IDS.map(id => TEMPLATES[id].label).join(' | ')
}

export function platformOptions(): string {
  return PLATFORM_IDS.map(id => `${PLATFORMS[id].icon} ${PLATFORMS[id].label}`).join(' | ')
}

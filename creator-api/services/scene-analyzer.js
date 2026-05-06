const SCENE_DEFINITIONS = {
  'product-showcase': {
    label: '产品展示',
    keywords: ['产品', '展示', '介绍', '新品', '开箱', '测评', '商品', '带货', '种草', 'product', 'showcase'],
    qualityWeight: 0.35,
    motionWeight: 0.20,
    speedWeight: 0.10,
    costWeight: 0.15,
    adherenceWeight: 0.20,
    requiredCapabilities: [],
    preferredCapabilities: ['sound', 'negativePrompt', 'cinematicControl'],
    defaultTier: 'pro',
    defaultDuration: 5,
  },
  'cinematic': {
    label: '电影感',
    keywords: ['电影', '大片', '质感', '氛围', '叙事', '故事', '剧情', '微电影', 'cinematic', 'film', 'movie'],
    qualityWeight: 0.40,
    motionWeight: 0.25,
    speedWeight: 0.05,
    costWeight: 0.05,
    adherenceWeight: 0.25,
    requiredCapabilities: [],
    preferredCapabilities: ['sound', 'negativePrompt', 'multiShot', 'cinematicControl'],
    defaultTier: 'flagship',
    defaultDuration: 10,
  },
  'character-action': {
    label: '人物动作',
    keywords: ['舞蹈', '跳舞', '动作', '运动', '健身', '武术', 'dance', 'action', 'sport'],
    qualityWeight: 0.25,
    motionWeight: 0.40,
    speedWeight: 0.10,
    costWeight: 0.10,
    adherenceWeight: 0.15,
    requiredCapabilities: [],
    preferredCapabilities: ['realPersonMode', 'sound'],
    defaultTier: 'flagship',
    defaultDuration: 5,
  },
  'vlog': {
    label: 'Vlog/日常',
    keywords: ['vlog', '日常', '生活', '记录', '旅行', '美食', '探店', '打卡', 'daily', 'travel'],
    qualityWeight: 0.20,
    motionWeight: 0.20,
    speedWeight: 0.25,
    costWeight: 0.25,
    adherenceWeight: 0.10,
    requiredCapabilities: [],
    preferredCapabilities: ['sound'],
    defaultTier: 'standard',
    defaultDuration: 5,
  },
  'social-media': {
    label: '社交媒体',
    keywords: ['短视频', '种草', '安利', '分享', 'social', 'tiktok', 'reels'],
    qualityWeight: 0.20,
    motionWeight: 0.15,
    speedWeight: 0.30,
    costWeight: 0.25,
    adherenceWeight: 0.10,
    requiredCapabilities: [],
    preferredCapabilities: ['sound', 'portraitMode'],
    defaultTier: 'standard',
    defaultDuration: 5,
  },
  'quick-preview': {
    label: '快速预览',
    keywords: ['预览', '草稿', '试试', '看看效果', '快速', '测试', '先来一个', 'preview', 'draft', 'test'],
    qualityWeight: 0.10,
    motionWeight: 0.10,
    speedWeight: 0.45,
    costWeight: 0.30,
    adherenceWeight: 0.05,
    requiredCapabilities: [],
    preferredCapabilities: [],
    defaultTier: 'fast',
    defaultDuration: 5,
  },
  'image-animation': {
    label: '图片转视频',
    keywords: ['图片动起来', '让图片动', '照片变视频', '静态转动态', 'animate image'],
    qualityWeight: 0.30,
    motionWeight: 0.30,
    speedWeight: 0.10,
    costWeight: 0.15,
    adherenceWeight: 0.15,
    requiredCapabilities: [],
    preferredCapabilities: ['movementAmplitude', 'sound'],
    defaultTier: 'pro',
    defaultDuration: 5,
  },
  'transition': {
    label: '转场/特效',
    keywords: ['转场', '特效', '变换', '过渡', 'morph', '变形', 'transition', 'effect'],
    qualityWeight: 0.30,
    motionWeight: 0.30,
    speedWeight: 0.10,
    costWeight: 0.15,
    adherenceWeight: 0.15,
    requiredCapabilities: [],
    preferredCapabilities: ['lastFrame', 'spatialUpscale'],
    defaultTier: 'pro',
    defaultDuration: 5,
  },
  'fashion': {
    label: '时尚/走秀',
    keywords: ['时尚', '服装', '穿搭', '模特', '时装周', 'fashion', 'runway', 'model', '走秀'],
    qualityWeight: 0.35,
    motionWeight: 0.30,
    speedWeight: 0.10,
    costWeight: 0.10,
    adherenceWeight: 0.15,
    requiredCapabilities: [],
    preferredCapabilities: ['realPersonMode', 'sound'],
    defaultTier: 'flagship',
    defaultDuration: 5,
  },
  'general': {
    label: '通用',
    keywords: [],
    qualityWeight: 0.25,
    motionWeight: 0.20,
    speedWeight: 0.20,
    costWeight: 0.20,
    adherenceWeight: 0.15,
    requiredCapabilities: [],
    preferredCapabilities: [],
    defaultTier: 'standard',
    defaultDuration: 5,
  },
  'commercial': {
    label: '商业广告',
    keywords: ['广告', '商业', '推广', '营销', '品牌', 'ad', 'commercial', 'brand'],
    qualityWeight: 0.40,
    motionWeight: 0.20,
    speedWeight: 0.05,
    costWeight: 0.10,
    adherenceWeight: 0.25,
    requiredCapabilities: [],
    preferredCapabilities: ['sound', 'negativePrompt', 'cinematicControl'],
    defaultTier: 'flagship',
    defaultDuration: 10,
  },
  'video-edit': {
    label: '视频编辑',
    keywords: ['编辑', '修改', '调整', '风格化', 'edit', 'modify', 'restyle'],
    qualityWeight: 0.30,
    motionWeight: 0.20,
    speedWeight: 0.20,
    costWeight: 0.15,
    adherenceWeight: 0.15,
    requiredCapabilities: [],
    preferredCapabilities: [],
    defaultTier: 'standard',
    defaultDuration: 10,
  },
  'start-end': {
    label: '首尾帧',
    keywords: ['首尾帧', '起始帧', '首帧尾帧'],
    qualityWeight: 0.30,
    motionWeight: 0.30,
    speedWeight: 0.10,
    costWeight: 0.15,
    adherenceWeight: 0.15,
    requiredCapabilities: [],
    preferredCapabilities: ['lastFrame'],
    defaultTier: 'pro',
    defaultDuration: 5,
  },
  'style-transfer': {
    label: '风格转换',
    keywords: ['风格转换', '风格化', 'style transfer'],
    qualityWeight: 0.25,
    motionWeight: 0.20,
    speedWeight: 0.20,
    costWeight: 0.20,
    adherenceWeight: 0.15,
    requiredCapabilities: [],
    preferredCapabilities: [],
    defaultTier: 'standard',
    defaultDuration: 10,
  },
  'draft': {
    label: '草稿',
    keywords: ['草稿', 'draft'],
    qualityWeight: 0.10,
    motionWeight: 0.10,
    speedWeight: 0.45,
    costWeight: 0.30,
    adherenceWeight: 0.05,
    requiredCapabilities: [],
    preferredCapabilities: [],
    defaultTier: 'fast',
    defaultDuration: 5,
  },
  'testing': {
    label: '测试',
    keywords: ['测试', 'testing'],
    qualityWeight: 0.10,
    motionWeight: 0.10,
    speedWeight: 0.45,
    costWeight: 0.30,
    adherenceWeight: 0.05,
    requiredCapabilities: [],
    preferredCapabilities: [],
    defaultTier: 'fast',
    defaultDuration: 5,
  },
  'iteration': {
    label: '迭代',
    keywords: ['迭代', 'iteration'],
    qualityWeight: 0.10,
    motionWeight: 0.10,
    speedWeight: 0.45,
    costWeight: 0.30,
    adherenceWeight: 0.05,
    requiredCapabilities: [],
    preferredCapabilities: [],
    defaultTier: 'fast',
    defaultDuration: 5,
  },
  'dance': {
    label: '舞蹈',
    keywords: ['舞蹈', '跳舞', 'dance'],
    qualityWeight: 0.25,
    motionWeight: 0.40,
    speedWeight: 0.10,
    costWeight: 0.10,
    adherenceWeight: 0.15,
    requiredCapabilities: [],
    preferredCapabilities: ['realPersonMode', 'sound'],
    defaultTier: 'flagship',
    defaultDuration: 5,
  },
  'quick-content': {
    label: '快速内容',
    keywords: ['快速内容', 'quick content'],
    qualityWeight: 0.20,
    motionWeight: 0.15,
    speedWeight: 0.30,
    costWeight: 0.25,
    adherenceWeight: 0.10,
    requiredCapabilities: [],
    preferredCapabilities: ['sound'],
    defaultTier: 'standard',
    defaultDuration: 5,
  },
  'text-heavy': {
    label: '文字密集',
    keywords: ['字幕', '文字', '标题'],
    qualityWeight: 0.20,
    motionWeight: 0.10,
    speedWeight: 0.20,
    costWeight: 0.20,
    adherenceWeight: 0.30,
    requiredCapabilities: [],
    preferredCapabilities: [],
    defaultTier: 'standard',
    defaultDuration: 5,
  },
  'realistic': {
    label: '写实',
    keywords: ['写实', '真实', '纪录片', 'realistic', 'documentary'],
    qualityWeight: 0.35,
    motionWeight: 0.20,
    speedWeight: 0.10,
    costWeight: 0.15,
    adherenceWeight: 0.20,
    requiredCapabilities: [],
    preferredCapabilities: ['sound'],
    defaultTier: 'pro',
    defaultDuration: 5,
  },
  'portrait-animation': {
    label: '人像动画',
    keywords: ['人像动画', '肖像动画'],
    qualityWeight: 0.30,
    motionWeight: 0.25,
    speedWeight: 0.15,
    costWeight: 0.15,
    adherenceWeight: 0.15,
    requiredCapabilities: [],
    preferredCapabilities: ['movementAmplitude', 'sound'],
    defaultTier: 'pro',
    defaultDuration: 5,
  },
  'fast-motion': {
    label: '快速动作',
    keywords: ['快速动作', '高速', 'fast motion'],
    qualityWeight: 0.25,
    motionWeight: 0.35,
    speedWeight: 0.10,
    costWeight: 0.15,
    adherenceWeight: 0.15,
    requiredCapabilities: [],
    preferredCapabilities: [],
    defaultTier: 'pro',
    defaultDuration: 5,
  },
  'abstract-art': {
    label: '抽象艺术',
    keywords: ['抽象', '艺术', 'abstract', 'art'],
    qualityWeight: 0.30,
    motionWeight: 0.20,
    speedWeight: 0.15,
    costWeight: 0.20,
    adherenceWeight: 0.15,
    requiredCapabilities: [],
    preferredCapabilities: [],
    defaultTier: 'standard',
    defaultDuration: 5,
  },
  'anime': {
    label: '动漫',
    keywords: ['动漫', '二次元', '卡通', 'anime', 'cartoon'],
    qualityWeight: 0.25,
    motionWeight: 0.25,
    speedWeight: 0.15,
    costWeight: 0.20,
    adherenceWeight: 0.15,
    requiredCapabilities: [],
    preferredCapabilities: [],
    defaultTier: 'standard',
    defaultDuration: 5,
  },
  'landscape': {
    label: '风景',
    keywords: ['风景', '自然', '山水', 'landscape', 'nature'],
    qualityWeight: 0.35,
    motionWeight: 0.15,
    speedWeight: 0.15,
    costWeight: 0.20,
    adherenceWeight: 0.15,
    requiredCapabilities: [],
    preferredCapabilities: ['sound'],
    defaultTier: 'standard',
    defaultDuration: 5,
  },
  'effects': {
    label: '特效',
    keywords: ['特效', 'effects', 'vfx'],
    qualityWeight: 0.30,
    motionWeight: 0.30,
    speedWeight: 0.10,
    costWeight: 0.15,
    adherenceWeight: 0.15,
    requiredCapabilities: [],
    preferredCapabilities: ['lastFrame', 'spatialUpscale'],
    defaultTier: 'pro',
    defaultDuration: 5,
  },
  'creative': {
    label: '创意',
    keywords: ['创意', 'creative'],
    qualityWeight: 0.25,
    motionWeight: 0.25,
    speedWeight: 0.15,
    costWeight: 0.20,
    adherenceWeight: 0.15,
    requiredCapabilities: [],
    preferredCapabilities: [],
    defaultTier: 'standard',
    defaultDuration: 5,
  },
}

const PLATFORM_KEYWORDS = {
  '抖音': 'social-media',
  '快手': 'social-media',
  '小红书': 'social-media',
  'TikTok': 'social-media',
  'YouTube': 'social-media',
  'Instagram': 'social-media',
}

export class SceneAnalyzer {
  analyze(userInput, intent = {}) {
    const text = (userInput || '').toLowerCase()
    const scenes = []

    for (const [sceneId, scene] of Object.entries(SCENE_DEFINITIONS)) {
      if (sceneId === 'general') continue

      let score = 0
      const matchedKeywords = []

      for (const kw of scene.keywords) {
        if (text.includes(kw.toLowerCase())) {
          score += 1
          matchedKeywords.push(kw)
        }
      }

      for (const [plat, sceneId2] of Object.entries(PLATFORM_KEYWORDS)) {
        if (sceneId === sceneId2 && text.includes(plat.toLowerCase())) {
          score += 1
        }
      }

      if (intent.taskType === 'image-to-video' && sceneId === 'image-animation') score += 2
      if (intent.hasImage && sceneId === 'image-animation') score += 1
      if (intent.hasVideo && sceneId === 'video-edit') score += 1

      if (score > 0) {
        scenes.push({
          sceneId,
          score,
          matchedKeywords,
          label: scene.label,
          qualityWeight: scene.qualityWeight,
          motionWeight: scene.motionWeight,
          speedWeight: scene.speedWeight,
          costWeight: scene.costWeight,
          adherenceWeight: scene.adherenceWeight,
          requiredCapabilities: scene.requiredCapabilities,
          preferredCapabilities: scene.preferredCapabilities,
          defaultTier: scene.defaultTier,
          defaultDuration: scene.defaultDuration,
        })
      }
    }

    if (scenes.length === 0) {
      const general = SCENE_DEFINITIONS['general']
      return {
        sceneId: 'general',
        score: 1,
        matchedKeywords: [],
        label: general.label,
        qualityWeight: general.qualityWeight,
        motionWeight: general.motionWeight,
        speedWeight: general.speedWeight,
        costWeight: general.costWeight,
        adherenceWeight: general.adherenceWeight,
        requiredCapabilities: general.requiredCapabilities,
        preferredCapabilities: general.preferredCapabilities,
        defaultTier: general.defaultTier,
        defaultDuration: general.defaultDuration,
      }
    }

    scenes.sort((a, b) => b.score - a.score)
    return scenes[0]
  }

  inferQualityNeed(userInput, scene) {
    const text = (userInput || '').toLowerCase()
    if (/4k|超清|最高|旗舰|专业|商业|广告/.test(text)) return 'flagship'
    if (/快速|预览|草稿|试试|测试/.test(text)) return 'fast'
    return scene.defaultTier || 'standard'
  }

  inferBudgetAwareness(userInput) {
    const text = (userInput || '').toLowerCase()
    if (/便宜|省钱|低成本|免费|优惠/.test(text)) return 'budget'
    if (/不在乎|最好|贵点也行|无所谓/.test(text)) return 'premium'
    return 'balanced'
  }
}

export { SCENE_DEFINITIONS }

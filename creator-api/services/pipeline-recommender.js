const PIPELINE_TEMPLATES = {
  'video-with-voiceover': {
    label: '视频+配音',
    triggerKeywords: ['配音', '旁白', '解说', '语音', '朗读', 'voiceover', 'narration'],
    steps: [
      { step: 'generate-video', taskType: 'text-to-video', tier: 'pro' },
      { step: 'generate-voiceover', outputType: 'audio', category: 'audio' },
    ],
    estimatedCost: '3-8 CNY',
  },
  'product-showcase-full': {
    label: '产品展示全流程',
    triggerKeywords: ['全流程', '完整', '全套', '从零开始', 'end-to-end'],
    steps: [
      { step: 'generate-product-image', taskType: 'text-to-image', tier: 'pro' },
      { step: 'image-to-video', taskType: 'image-to-video', tier: 'pro' },
      { step: 'add-voiceover', outputType: 'audio', category: 'audio' },
    ],
    estimatedCost: '5-15 CNY',
  },
  'video-enhance': {
    label: '视频增强',
    triggerKeywords: ['增强', '超清', '高清', '画质提升', 'upscale', 'enhance'],
    steps: [
      { step: 'generate-video', taskType: 'text-to-video', tier: 'standard' },
      { step: 'upscale-video', taskType: 'video-to-video', tier: 'pro' },
    ],
    estimatedCost: '2-6 CNY',
  },
  'image-to-video-with-audio': {
    label: '图片转视频+配乐',
    triggerKeywords: ['图片转视频+配乐', '图片动起来+音乐', 'animate with audio'],
    steps: [
      { step: 'image-to-video', taskType: 'image-to-video', tier: 'pro', requireSound: true },
    ],
    estimatedCost: '2-5 CNY',
  },
}

export class PipelineRecommender {
  constructor(modelRouter) {
    this.modelRouter = modelRouter
  }

  recommendPipeline(userInput, intent = {}) {
    const text = (userInput || '').toLowerCase()
    const pipelines = []

    for (const [pipelineId, template] of Object.entries(PIPELINE_TEMPLATES)) {
      let relevanceScore = 0

      for (const kw of template.triggerKeywords) {
        if (text.includes(kw.toLowerCase())) {
          relevanceScore += 3
        }
      }

      if (intent.taskType === 'image-to-video' && pipelineId === 'image-to-video-with-audio') {
        relevanceScore += 1
      }

      if (relevanceScore > 0) {
        const stepsWithModels = template.steps.map(step => {
          let models = []
          if (this.modelRouter) {
            try {
              const candidates = this.modelRouter.searchModels({
                taskType: step.taskType,
                outputType: step.outputType,
              })
              models = candidates.slice(0, 3)
            } catch {
              // search failure is non-critical
            }
          }
          return { ...step, recommendedModels: models }
        })

        pipelines.push({
          pipelineId,
          ...template,
          steps: stepsWithModels,
          relevanceScore,
        })
      }
    }

    pipelines.sort((a, b) => b.relevanceScore - a.relevanceScore)
    return pipelines
  }
}

export { PIPELINE_TEMPLATES }

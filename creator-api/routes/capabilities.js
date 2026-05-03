import { Router } from 'express'
import { ModelRouter } from '../../skills/runninghub/model-router.js'

export const capabilitiesRouter = Router()

let router = null

function getRouter() {
  if (!router) {
    try {
      router = new ModelRouter()
    } catch {
      router = null
    }
  }
  return router
}

capabilitiesRouter.get('/', (req, res) => {
  try {
    const r = getRouter()
    if (!r) {
      return res.json({
        success: true,
        taskTypes: ['text-to-video', 'image-to-video', 'text-to-image', 'video-to-video'],
        note: 'model-registry not available, showing defaults',
      })
    }

    const tasks = r.listCapabilities()
    const { taskType } = req.query
    const filter = taskType ? { taskType } : {}
    const models = r.searchModels(filter)
    const summary = models.map((m) => ({
      endpoint: m.endpoint,
      name: m.name,
      taskType: m.taskType,
      outputType: m.outputType,
      inputTypes: m.inputTypes,
      description: m.category,
    }))

    res.json({
      success: true,
      taskTypes: tasks,
      models: summary,
      filter: taskType || null,
    })
  } catch (e) {
    console.error('[capabilities] error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

capabilitiesRouter.get('/models/:endpoint/schema', (req, res) => {
  try {
    const r = getRouter()
    if (!r) {
      return res.status(404).json({ success: false, error: 'model-registry not available' })
    }
    const schema = r.getModelSchema(req.params.endpoint)
    if (!schema) {
      return res.status(404).json({ success: false, error: `model ${req.params.endpoint} not found` })
    }
    res.json({ success: true, schema })
  } catch (e) {
    console.error('[capabilities] schema error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

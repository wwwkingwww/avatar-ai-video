import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import {
  createSession,
  uploadFile,
  submitTask,
  getSessionStatus,
  approvePublish,
  getCapabilities,
  getModelSchema,
  getTaskStatus,
} from '@/services/api'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
afterEach(() => server.resetHandlers())

describe('createSession', () => {
  it('成功创建会话', async () => {
    server.use(
      http.post('/api/sessions', () => {
        return HttpResponse.json({ sessionId: 'sess-123', message: '你好', round: 1 })
      })
    )

    const result = await createSession()
    expect(result.sessionId).toBe('sess-123')
    expect(result.round).toBe(1)
  })

  it('创建失败抛出错误', async () => {
    server.use(
      http.post('/api/sessions', () => {
        return HttpResponse.json({ error: '服务器错误' }, { status: 500 })
      })
    )

    await expect(createSession()).rejects.toThrow('创建会话失败')
  })
})

describe('uploadFile', () => {
  it('成功上传文件', async () => {
    server.use(
      http.post('/api/sessions/sess-123/upload', () => {
        return HttpResponse.json({ success: true, url: '/uploads/test.jpg', name: 'test.jpg', size: 1024 })
      })
    )

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
    const result = await uploadFile('sess-123', file)
    expect(result.url).toBe('/uploads/test.jpg')
    expect(result.name).toBe('test.jpg')
  })

  it('上传失败抛出错误', async () => {
    server.use(
      http.post('/api/sessions/sess-123/upload', () => {
        return HttpResponse.json({ success: false, error: '文件太大' })
      })
    )

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
    await expect(uploadFile('sess-123', file)).rejects.toThrow('文件太大')
  })
})

describe('submitTask', () => {
  it('成功提交任务', async () => {
    server.use(
      http.post('/api/sessions/sess-123/submit', () => {
        return HttpResponse.json({
          success: true,
          taskId: 'job-456',
          status: 'GENERATING',
          estimatedMinutes: 20,
        })
      })
    )

    const result = await submitTask('sess-123')
    expect(result.taskId).toBe('job-456')
    expect(result.status).toBe('GENERATING')
    expect(result.estimatedMinutes).toBe(20)
  })

  it('提交失败抛出错误', async () => {
    server.use(
      http.post('/api/sessions/sess-123/submit', () => {
        return HttpResponse.json({ success: false, error: '模型不可用' }, { status: 400 })
      })
    )

    await expect(submitTask('sess-123')).rejects.toThrow('模型不可用')
  })

  it('HTTP 错误时使用状态码描述', async () => {
    server.use(
      http.post('/api/sessions/sess-123/submit', () => {
        return HttpResponse.json({}, { status: 500 })
      })
    )

    await expect(submitTask('sess-123')).rejects.toThrow('提交失败')
  })
})

describe('getSessionStatus', () => {
  it('获取会话状态', async () => {
    server.use(
      http.get('/api/sessions/sess-123/status', () => {
        return HttpResponse.json({ success: true, status: 'chatting', round: 2, taskId: null })
      })
    )

    const result = await getSessionStatus('sess-123')
    expect(result.status).toBe('chatting')
    expect(result.round).toBe(2)
  })
})

describe('approvePublish', () => {
  it('批准发布', async () => {
    server.use(
      http.post('/api/sessions/sess-123/approve', () => {
        return HttpResponse.json({ success: true, message: '已批准' })
      })
    )

    const result = await approvePublish('sess-123')
    expect(result.success).toBe(true)
  })
})

describe('getCapabilities', () => {
  it('获取能力列表', async () => {
    server.use(
      http.get('/api/capabilities', () => {
        return HttpResponse.json({
          taskTypes: ['text-to-video', 'image-to-video'],
          models: [{ endpoint: 'm1', name: '模型1', taskType: 'text-to-video', description: 'desc' }],
        })
      })
    )

    const result = await getCapabilities()
    expect(result.taskTypes).toHaveLength(2)
    expect(result.models).toHaveLength(1)
  })

  it('按 taskType 过滤', async () => {
    let url: URL | null = null
    server.use(
      http.get('/api/capabilities', ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json({ taskTypes: [], models: [] })
      })
    )

    await getCapabilities('text-to-video')
    expect(url!.searchParams.get('taskType')).toBe('text-to-video')
  })
})

describe('getModelSchema', () => {
  it('获取模型参数 schema', async () => {
    server.use(
      http.get('/api/capabilities/models/test-endpoint/schema', () => {
        return HttpResponse.json({
          schema: { endpoint: 'test-endpoint', name: 'Test', taskType: 'video', description: 'desc' },
        })
      })
    )

    const result = await getModelSchema('test-endpoint')
    expect(result.endpoint).toBe('test-endpoint')
  })
})

describe('getTaskStatus', () => {
  it('获取任务状态', async () => {
    server.use(
      http.get('/api/tasks/job-456', () => {
        return HttpResponse.json({
          success: true,
          data: { id: 'job-456', status: 'GENERATING', template: 'vlog', platform: 'douyin' },
        })
      })
    )

    const result = await getTaskStatus('job-456')
    expect(result.id).toBe('job-456')
    expect(result.status).toBe('GENERATING')
  })
})

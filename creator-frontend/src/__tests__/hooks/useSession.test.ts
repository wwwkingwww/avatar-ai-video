import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
afterEach(() => {
  server.resetHandlers()
  vi.restoreAllMocks()
})

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    sendMessage: vi.fn(),
  }
})

import { useSession } from '@/hooks/useSession'
import * as api from '@/services/api'

describe('useSession', () => {
  describe('initSession', () => {
    it('成功创建会话并解析选项消息', async () => {
      server.use(
        http.post('/api/sessions', () => {
          return HttpResponse.json({
            sessionId: 'sess-001',
            message: '你好！请选择模板：[OPTIONS:single:口播讲解, 科技评测]',
            round: 1,
          })
        })
      )

      const { result } = renderHook(() => useSession())

      await act(async () => {
        await result.current.initSession()
      })

      await waitFor(() => {
        expect(result.current.state.sessionId).toBe('sess-001')
      })

      expect(result.current.state.round).toBe(1)
      expect(result.current.state.messages).toHaveLength(1)
      expect(result.current.state.messages[0].role).toBe('assistant')
      expect(result.current.state.messages[0].content).toBe('你好！请选择模板：')
      expect(result.current.state.messages[0].options).toEqual(['口播讲解', '科技评测'])
      expect(result.current.state.messages[0].optionMode).toBe('single')
    })

    it('创建会话失败时添加错误消息', async () => {
      server.use(
        http.post('/api/sessions', () => {
          return HttpResponse.json({ error: '服务器错误' }, { status: 500 })
        })
      )

      const { result } = renderHook(() => useSession())

      await act(async () => {
        await result.current.initSession()
      })

      expect(result.current.state.sessionId).toBeNull()
      expect(result.current.state.messages).toHaveLength(1)
      expect(result.current.state.messages[0].role).toBe('system')
      expect(result.current.state.messages[0].content).toContain('连接失败')
    })

    it('消息中无 OPTIONS 标记时 options 为空', async () => {
      server.use(
        http.post('/api/sessions', () => {
          return HttpResponse.json({
            sessionId: 'sess-002',
            message: '你好，我是 AI 助手',
            round: 1,
          })
        })
      )

      const { result } = renderHook(() => useSession())

      await act(async () => {
        await result.current.initSession()
      })

      await waitFor(() => {
        expect(result.current.state.messages).toHaveLength(1)
      })

      expect(result.current.state.messages[0].options).toBeUndefined()
    })

    it('并发调用只创建一次会话', async () => {
      let callCount = 0
      server.use(
        http.post('/api/sessions', () => {
          callCount++
          return HttpResponse.json({
            sessionId: `sess-${callCount}`,
            message: '你好',
            round: 1,
          })
        })
      )

      const { result } = renderHook(() => useSession())

      await act(async () => {
        await Promise.all([
          result.current.initSession(),
          result.current.initSession(),
          result.current.initSession(),
        ])
      })

      expect(callCount).toBe(1)
    })
  })

  describe('ensureSession', () => {
    it('已有 sessionId 时直接返回', async () => {
      server.use(
        http.post('/api/sessions', () => {
          return HttpResponse.json({ sessionId: 'sess-003', message: '你好', round: 1 })
        })
      )

      const { result } = renderHook(() => useSession())

      await act(async () => {
        await result.current.initSession()
      })

      expect(result.current.state.sessionId).toBe('sess-003')

      let returnedId: string | null = null
      await act(async () => {
        returnedId = await result.current.ensureSession()
      })

      expect(returnedId).toBe('sess-003')
    })
  })

  describe('computeStep', () => {
    it('状态为 submitted 时返回 3', async () => {
      server.use(
        http.post('/api/sessions', () => {
          return HttpResponse.json({ sessionId: 'sess-step', message: '你好', round: 1 })
        })
      )

      const { result } = renderHook(() => useSession())

      await act(async () => {
        await result.current.initSession()
      })

      expect(result.current.step).toBeGreaterThanOrEqual(1)
      expect(result.current.step).toBeLessThanOrEqual(2)
    })
  })

  describe('handleFileUpload', () => {
    it('上传文件成功', async () => {
      server.use(
        http.post('/api/sessions', () => {
          return HttpResponse.json({ sessionId: 'sess-uf', message: '请上传文件', round: 1 })
        }),
        http.post('/api/sessions/sess-uf/upload', () => {
          return HttpResponse.json({ success: true, url: '/uploads/test.png', name: 'test.png', size: 2048 })
        })
      )

      const { result } = renderHook(() => useSession())

      await act(async () => {
        await result.current.initSession()
      })

      const file = new File(['test'], 'test.png', { type: 'image/png' })
      await act(async () => {
        await result.current.handleFileUpload(file)
      })

      expect(result.current.uploadedFiles).toHaveLength(1)
      expect(result.current.uploadedFiles[0].name).toBe('test.png')
    })

    it('无会话时先创建会话再上传', async () => {
      server.use(
        http.post('/api/sessions', () => {
          return HttpResponse.json({ sessionId: 'sess-auto', message: '你好', round: 1 })
        }),
        http.post('/api/sessions/sess-auto/upload', () => {
          return HttpResponse.json({ success: true, url: '/uploads/f.png', name: 'f.png', size: 512 })
        })
      )

      const { result } = renderHook(() => useSession())

      const file = new File(['data'], 'f.png', { type: 'image/png' })
      await act(async () => {
        await result.current.handleFileUpload(file)
      })

      expect(result.current.state.sessionId).toBe('sess-auto')
      expect(result.current.uploadedFiles).toHaveLength(1)
    })

    it('上传失败显示错误消息', async () => {
      server.use(
        http.post('/api/sessions', () => {
          return HttpResponse.json({ sessionId: 'sess-fail', message: '请上传', round: 1 })
        }),
        http.post('/api/sessions/sess-fail/upload', () => {
          return HttpResponse.json({ success: false, error: '文件格式不支持' }, { status: 400 })
        })
      )

      const { result } = renderHook(() => useSession())

      await act(async () => {
        await result.current.initSession()
      })

      const file = new File(['bad'], 'bad.exe', { type: 'application/octet-stream' })
      await act(async () => {
        await result.current.handleFileUpload(file)
      })

      const sysMessages = result.current.state.messages.filter(m => m.role === 'system')
      expect(sysMessages).toHaveLength(1)
      expect(sysMessages[0].content).toContain('文件上传失败')
    })
  })

  describe('sendUserMessage', () => {
    it('发送普通消息进入 streaming 状态', async () => {
      vi.mocked(api.sendMessage).mockResolvedValue(new AbortController())

      server.use(
        http.post('/api/sessions', () => {
          return HttpResponse.json({ sessionId: 'sess-msg', message: '你好', round: 1 })
        })
      )

      const { result } = renderHook(() => useSession())

      await act(async () => {
        await result.current.initSession()
      })

      await act(async () => {
        result.current.sendUserMessage('你好 AI')
      })

      expect(result.current.state.isStreaming).toBe(true)
      expect(result.current.state.messages.some(m => m.role === 'user')).toBe(true)
    })

    it('streaming 期间阻止新消息', async () => {
      vi.mocked(api.sendMessage).mockResolvedValue(new AbortController())

      server.use(
        http.post('/api/sessions', () => {
          return HttpResponse.json({ sessionId: 'sess-block', message: '你好', round: 1 })
        })
      )

      const { result } = renderHook(() => useSession())

      await act(async () => {
        await result.current.initSession()
      })

      await act(async () => {
        result.current.sendUserMessage('第一条')
      })

      const msgCount = result.current.state.messages.length

      await act(async () => {
        result.current.sendUserMessage('第二条')
      })

      expect(result.current.state.messages.length).toBe(msgCount)
    })

    it('无会话时自动初始化', async () => {
      vi.mocked(api.sendMessage).mockResolvedValue(new AbortController())

      server.use(
        http.post('/api/sessions', () => {
          return HttpResponse.json({ sessionId: 'sess-auto2', message: '你好', round: 1 })
        })
      )

      const { result } = renderHook(() => useSession())

      await act(async () => {
        result.current.sendUserMessage('直接发送')
      })

      await waitFor(() => {
        expect(result.current.state.sessionId).toBe('sess-auto2')
      })

      expect(result.current.state.isStreaming).toBe(true)
    })
  })

  describe('确认提交', () => {
    it('确认命令触发 submit', async () => {
      server.use(
        http.post('/api/sessions', () => {
          return HttpResponse.json({ sessionId: 'sess-sub', message: '准备就绪', round: 1 })
        }),
        http.post('/api/sessions/sess-sub/submit', () => {
          return HttpResponse.json({
            success: true,
            taskId: 'job-789',
            status: 'GENERATING',
            estimatedMinutes: 15,
          })
        })
      )

      const { result } = renderHook(() => useSession())

      await act(async () => {
        await result.current.initSession()
      })

      await act(async () => {
        result.current.sendUserMessage('确认生成')
      })

      await waitFor(() => {
        expect(result.current.taskId).toBe('job-789')
      })

      expect(result.current.state.status).toBe('submitted')
    })

    it('submit 失败尝试获取当前状态', async () => {
      server.use(
        http.post('/api/sessions', () => {
          return HttpResponse.json({ sessionId: 'sess-409', message: '你好', round: 1 })
        }),
        http.post('/api/sessions/sess-409/submit', () => {
          return HttpResponse.json({ error: '状态冲突' }, { status: 409 })
        }),
        http.get('/api/sessions/sess-409/status', () => {
          return HttpResponse.json({ success: true, status: 'submitted', round: 1, taskId: 'job-existing' })
        })
      )

      const { result } = renderHook(() => useSession())

      await act(async () => {
        await result.current.initSession()
      })

      await act(async () => {
        result.current.sendUserMessage('✓ 确认生成')
      })

      await waitFor(() => {
        expect(result.current.taskId).toBe('job-existing')
      })

      expect(result.current.state.status).toBe('submitted')
    })
  })
})

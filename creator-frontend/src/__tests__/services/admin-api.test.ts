import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import * as adminApi from '@/services/admin-api'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
afterEach(() => server.resetHandlers())

describe('admin-api 工具函数', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('isAuthenticated', () => {
    it('无 token 时返回 false', () => {
      expect(adminApi.isAuthenticated()).toBe(false)
    })

    it('有 token 时返回 true', () => {
      localStorage.setItem('admin_token', 'test-token-123')
      expect(adminApi.isAuthenticated()).toBe(true)
    })
  })

  describe('logout', () => {
    it('清除 localStorage 中的 token', () => {
      localStorage.setItem('admin_token', 'test-token')
      expect(localStorage.getItem('admin_token')).toBe('test-token')
      adminApi.logout()
      expect(localStorage.getItem('admin_token')).toBeNull()
    })
  })
})

describe('admin-api 网络请求', () => {
  beforeEach(() => {
    localStorage.setItem('admin_token', 'valid-token')
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('login', () => {
    it('成功登录返回 token', async () => {
      server.use(
        http.post('/api/admin/login', async ({ request }) => {
          const body = await request.json() as { password: string }
          if (body.password === 'correct') {
            return HttpResponse.json({ success: true, token: 'new-token' })
          }
          return HttpResponse.json({ success: false, error: '密码错误' }, { status: 401 })
        })
      )

      const result = await adminApi.login('correct')
      expect(result.success).toBe(true)
      expect(result.token).toBe('new-token')
    })

    it('密码错误返回失败', async () => {
      server.use(
        http.post('/api/admin/login', () => {
          return HttpResponse.json({ success: false, error: '密码错误' }, { status: 401 })
        })
      )

      const result = await adminApi.login('wrong')
      expect(result.success).toBe(false)
      expect(result.error).toBe('密码错误')
    })
  })

  describe('fetchModels', () => {
    it('获取模型列表', async () => {
      server.use(
        http.get('/api/admin/models', () => {
          return HttpResponse.json({
            success: true,
            data: [{ id: '1', endpoint: 'test', nameCn: '测试', status: 'published' }],
            meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
          })
        })
      )

      const result = await adminApi.fetchModels()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.meta.total).toBe(1)
    })

    it('带查询参数', async () => {
      let url: URL | null = null
      server.use(
        http.get('/api/admin/models', ({ request }) => {
          url = new URL(request.url)
          return HttpResponse.json({ success: true, data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } })
        })
      )

      await adminApi.fetchModels({ page: 2, limit: 10, search: 'test', category: 'video', status: 'published' })
      expect(url!.searchParams.get('page')).toBe('2')
      expect(url!.searchParams.get('limit')).toBe('10')
      expect(url!.searchParams.get('search')).toBe('test')
      expect(url!.searchParams.get('category')).toBe('video')
      expect(url!.searchParams.get('status')).toBe('published')
    })

    it('category 为 all 时不传参数', async () => {
      let url: URL | null = null
      server.use(
        http.get('/api/admin/models', ({ request }) => {
          url = new URL(request.url)
          return HttpResponse.json({ success: true, data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } })
        })
      )

      await adminApi.fetchModels({ category: 'all', status: 'all' })
      expect(url!.searchParams.has('category')).toBe(false)
      expect(url!.searchParams.has('status')).toBe(false)
    })

    it('401 时自动 logout 清除 token', async () => {
      server.use(
        http.get('/api/admin/models', () => {
          return HttpResponse.json({ error: 'unauthorized' }, { status: 401 })
        })
      )

      await expect(adminApi.fetchModels()).rejects.toThrow('未授权')
      expect(localStorage.getItem('admin_token')).toBeNull()
    })
  })

  describe('fetchModel', () => {
    it('获取单个模型', async () => {
      server.use(
        http.get('/api/admin/models/123', () => {
          return HttpResponse.json({
            success: true,
            data: { id: '123', endpoint: 'test', nameCn: '测试', status: 'published' },
          })
        })
      )

      const result = await adminApi.fetchModel('123')
      expect(result.success).toBe(true)
      expect(result.data.id).toBe('123')
    })
  })

  describe('createModel', () => {
    it('创建模型成功', async () => {
      server.use(
        http.post('/api/admin/models', () => {
          return HttpResponse.json({
            success: true,
            data: { id: 'new', endpoint: 'new-endpoint', nameCn: '新模型', status: 'draft' },
          })
        })
      )

      const result = await adminApi.createModel({ nameCn: '新模型', endpoint: 'new-endpoint' })
      expect(result.success).toBe(true)
      expect(result.data.id).toBe('new')
    })
  })

  describe('updateModel', () => {
    it('更新模型成功', async () => {
      server.use(
        http.patch('/api/admin/models/123', () => {
          return HttpResponse.json({
            success: true,
            data: { id: '123', endpoint: 'updated', nameCn: '已更新', status: 'published' },
          })
        })
      )

      const result = await adminApi.updateModel('123', { nameCn: '已更新' })
      expect(result.success).toBe(true)
      expect(result.data.nameCn).toBe('已更新')
    })
  })

  describe('deleteModel', () => {
    it('删除模型成功', async () => {
      server.use(
        http.delete('/api/admin/models/123', () => {
          return HttpResponse.json({ success: true })
        })
      )

      const result = await adminApi.deleteModel('123')
      expect(result.success).toBe(true)
    })
  })

  describe('batchOperation', () => {
    it('批量发布', async () => {
      server.use(
        http.post('/api/admin/models/batch', () => {
          return HttpResponse.json({ success: true, affected: 3 })
        })
      )

      const result = await adminApi.batchOperation(['1', '2', '3'], 'publish')
      expect(result.success).toBe(true)
      expect(result.affected).toBe(3)
    })
  })

  describe('fetchCategories', () => {
    it('获取分类列表', async () => {
      server.use(
        http.get('/api/admin/models/categories', () => {
          return HttpResponse.json({ success: true, data: ['视频', '图片', '音频'] })
        })
      )

      const result = await adminApi.fetchCategories()
      expect(result.success).toBe(true)
      expect(result.data).toEqual(['视频', '图片', '音频'])
    })
  })

  describe('fetchStats', () => {
    it('获取统计数据', async () => {
      server.use(
        http.get('/api/admin/stats', () => {
          return HttpResponse.json({
            success: true,
            data: { total: 10, published: 5, disabled: 3, draft: 2 },
          })
        })
      )

      const result = await adminApi.fetchStats()
      expect(result.success).toBe(true)
      expect(result.data.total).toBe(10)
      expect(result.data.published).toBe(5)
    })
  })
})

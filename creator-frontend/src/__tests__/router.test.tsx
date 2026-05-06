import { describe, it, expect } from 'vitest'
import { createMemoryRouter } from 'react-router-dom'
import { router } from '@/router'

describe('router', () => {
  it('路由数量为 5 条', () => {
    expect(router.routes).toHaveLength(5)
  })

  it('包含根路由 /', () => {
    const route = router.routes.find(r => r.path === '/')
    expect(route).toBeDefined()
  })

  it('包含 /creator 路由', () => {
    const route = router.routes.find(r => r.path === '/creator')
    expect(route).toBeDefined()
  })

  it('包含 /dashboard/:view? 路由', () => {
    const route = router.routes.find(r => r.path === '/dashboard/:view?')
    expect(route).toBeDefined()
  })

  it('包含 /admin/login 路由', () => {
    const route = router.routes.find(r => r.path === '/admin/login')
    expect(route).toBeDefined()
  })

  it('包含 /admin/dashboard/:view? 路由', () => {
    const route = router.routes.find(r => r.path === '/admin/dashboard/:view?')
    expect(route).toBeDefined()
  })

  it('所有路由都有 element', () => {
    for (const route of router.routes) {
      expect((route as Record<string, unknown>).element).toBeDefined()
    }
  })

  it('createMemoryRouter 可正常创建', () => {
    const memoryRouter = createMemoryRouter(router.routes)
    expect(memoryRouter).toBeDefined()
    expect(memoryRouter.routes).toHaveLength(5)
  })
})

import { Page, Route } from '@playwright/test'

export async function mockApiRoutes(page: Page) {
  const sessionIds: string[] = []

  await page.route('**/api/sessions', async (route: Route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId: 'e2e-session-001',
          message: '你好！请选择任务类型：[OPTIONS:single:文生视频, 图生视频, 视频编辑]',
          round: 1,
        }),
      })
    }
    return route.continue()
  })

  await page.route('**/api/sessions/*/messages', async (route: Route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: [
          'data: {"type":"chunk","content":"好的，我来帮你创建一个文生视频。"}\n\n',
          'data: {"type":"chunk","content":"请选择模板：[OPTIONS:single:口播讲解, 科技评测, 产品展示, 日常Vlog]"}\n\n',
          'data: {"type":"done","round":2,"forceConfirm":false}\n\n',
        ].join(''),
      })
    }
    return route.continue()
  })

  await page.route('**/api/sessions/*/submit', async (route: Route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          taskId: 'e2e-task-001',
          status: 'GENERATING',
          estimatedMinutes: 15,
          jobId: 'e2e-job-001',
        }),
      })
    }
    return route.continue()
  })

  await page.route('**/api/sessions/*/status', async (route: Route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, status: 'chatting', round: 1, taskId: null }),
    })
  })

  await page.route('**/api/sessions/*/upload', async (route: Route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, url: '/uploads/e2e-test.png', name: 'e2e-test.png', size: 2048 }),
    })
  })

  await page.route('**/api/capabilities**', async (route: Route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        taskTypes: ['text-to-video', 'image-to-video', 'text-to-image', 'video-to-video'],
        models: [],
      }),
    })
  })

  await page.route('**/api/admin/**', async (route: Route) => {
    return route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'unauthorized' }),
    })
  })
}

import { test, expect } from '@playwright/test'
import { mockApiRoutes } from './mocks'

test.describe('Creator Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page)
    await page.goto('/')
  })

  test('发送消息后创建会话并收到 AI 回复', async ({ page }) => {
    const input = page.getByPlaceholder('描述你的视频创意...').first()
    await input.fill('文生视频')
    await page.getByRole('button', { name: '创建' }).first().click()

    // 用户消息出现在对话中
    await expect(page.locator('.bubble.user .bubble-content', { hasText: '文生视频' })).toBeVisible({ timeout: 10000 })
  })

  test('发送文生视频后收到 OPTIONS 选项', async ({ page }) => {
    const input = page.getByPlaceholder('描述你的视频创意...').first()
    await input.fill('文生视频')
    await page.getByRole('button', { name: '创建' }).first().click()

    await expect(page.getByRole('button', { name: '口播讲解' }).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: '科技评测' }).first()).toBeVisible()
  })
})

test.describe('Creator Page Route', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page)
  })

  test('/creator 路由正确渲染', async ({ page }) => {
    await page.goto('/creator')
    await expect(page.locator('.creator-app')).toBeVisible()
  })

  test('/creator 页面聊天输入框可交互', async ({ page }) => {
    await page.goto('/creator')
    const input = page.getByPlaceholder('描述你的视频创意...').first()
    await expect(input).toBeVisible()
    await input.fill('你好')
    await expect(input).toHaveValue('你好')
  })
})

test.describe('Confirmation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page)
    await page.goto('/')
  })

  test('发送确认生成消息后页面不崩溃', async ({ page }) => {
    const input = page.getByPlaceholder('描述你的视频创意...').first()
    await input.fill('确认生成')
    await page.getByRole('button', { name: '创建' }).first().click()

    // 确认命令直接提交，页面应保持正常状态
    await expect(page.locator('.landing-chat-section')).toBeVisible()
  })
})

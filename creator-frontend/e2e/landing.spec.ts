import { test, expect } from '@playwright/test'
import { mockApiRoutes } from './mocks'

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page)
    await page.goto('/')
  })

  test('页面标题渲染正确', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '暗房工作室' })).toBeVisible()
    await expect(page.getByText('AI 智能创作平台')).toBeVisible()
  })

  test('顶部导航栏包含管理后台链接', async ({ page }) => {
    const adminLink = page.getByRole('link', { name: '管理后台' })
    await expect(adminLink).toBeVisible()
  })

  test('聊天输入框和创建按钮存在', async ({ page }) => {
    const input = page.getByPlaceholder('描述你的视频创意...').first()
    await expect(input).toBeVisible()

    const createButton = page.getByRole('button', { name: '创建' }).first()
    await expect(createButton).toBeVisible()
  })

  test('输入空内容时创建按钮禁用', async ({ page }) => {
    const createButton = page.getByRole('button', { name: '创建' }).first()
    await expect(createButton).toBeDisabled()
  })

  test('输入文本后创建按钮启用', async ({ page }) => {
    const input = page.getByPlaceholder('描述你的视频创意...').first()
    await input.fill('文生视频')
    const createButton = page.getByRole('button', { name: '创建' }).first()
    await expect(createButton).toBeEnabled()
  })
})

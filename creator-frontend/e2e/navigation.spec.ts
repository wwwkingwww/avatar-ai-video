import { test, expect } from '@playwright/test'
import { mockApiRoutes } from './mocks'

test.describe('Page Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page)
  })

  test('首页 → /creator 导航', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '暗房工作室' })).toBeVisible()

    await page.goto('/creator')
    await expect(page.locator('.creator-app')).toBeVisible()
  })

  test('首页 → /dashboard 可访问', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).not.toHaveURL(/error/)
  })

  test('/admin/login 可访问', async ({ page }) => {
    await page.goto('/admin/login')
    await expect(page).not.toHaveURL(/error/)
  })
})

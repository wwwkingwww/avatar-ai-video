import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const PASS = '✅'
const FAIL = '❌'

let passed = 0
let failed = 0

async function check(name, fn) {
  process.stdout.write(`  ${name}... `)
  try {
    await fn()
    console.log(PASS)
    passed++
  } catch (e) {
    console.log(`${FAIL} ${e.message}`)
    failed++
  }
}

async function main() {
  console.log('\n🎬 AI视频创作系统 — E2E 冒烟测试\n')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })

  try {
    const page = await context.newPage()

    await check('页面加载 HTTP 200', async () => {
      const res = await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 10000 })
      if (res.status() !== 200) throw new Error(`HTTP ${res.status()}`)
    })

    await check('SplashScreen 标题渲染', async () => {
      await page.waitForSelector('h2', { timeout: 5000 })
      const title = await page.textContent('h2')
      if (!title?.includes('AI')) throw new Error(`标题异常: "${title}"`)
    })

    await check('SplashScreen "开始创作"按钮可见', async () => {
      const btn = page.locator('button', { hasText: '开始创作' })
      const visible = await btn.isVisible({ timeout: 3000 })
      if (!visible) throw new Error('按钮不可见')
    })

    await check('SplashScreen "管理后台"链接可见', async () => {
      const link = page.locator('a', { hasText: '管理后台' })
      const visible = await link.isVisible({ timeout: 3000 })
      if (!visible) throw new Error('链接不可见')
    })

    await check('点击"开始创作"后 ChatView 出现', async () => {
      await page.locator('button', { hasText: '开始创作' }).click()
      await page.waitForTimeout(1000)
      const hasInput = await page.locator('.input-area').isVisible({ timeout: 3000 }).catch(() => false)
      const hasIndicator = await page.locator('.round-indicator').isVisible({ timeout: 3000 }).catch(() => false)
      // 聊天视图至少应该渲染输入区或轮次指示器
      if (!hasInput && !hasIndicator) {
        const bodyText = await page.textContent('body').catch(() => '')
        throw new Error(`ChatView未渲染, body: ${bodyText?.substring(0, 200)}`)
      }
    })

    await check('消息列表区域存在', async () => {
      const list = page.locator('.message-list')
      const visible = await list.isVisible({ timeout: 3000 })
      if (!visible) throw new Error('.message-list 不存在')
    })

    await check('页面 CSS 变量正确加载（暗色背景）', async () => {
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      if (!bg || bg === 'rgba(0, 0, 0, 0)') throw new Error(`背景色异常: ${bg}`)
    })

    await check('SplashScreen 重置后可重新进入', async () => {
      await page.goto(BASE, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('h2', { timeout: 5000 })
      const visible = await page.locator('h2').isVisible()
      if (!visible) throw new Error('重新进入后标题不显示')
    })

    await check('Dashboard 页面可访问', async () => {
      await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)
      const bodyText = await page.textContent('body').catch(() => '')
      if (!bodyText || bodyText.length < 10) throw new Error('Dashboard 页面为空')
    })

    await check('Dashboard 返回 SplashScreen', async () => {
      await page.goto(BASE, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('h2', { timeout: 5000 })
      const visible = await page.locator('h2').isVisible()
      if (!visible) throw new Error('返回首页失败')
    })

  } finally {
    await browser.close()
  }

  console.log(`\n${'─'.repeat(35)}`)
  const total = passed + failed
  const icon = failed === 0 ? '🎉' : '⚠️'
  console.log(`${icon}  ${passed}/${total} 通过`)
  console.log(`${'─'.repeat(35)}\n`)

  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error('E2E 异常:', e.message)
  process.exit(1)
})

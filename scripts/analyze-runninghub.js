import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'https://rhtv.runninghub.cn';
const PROJECTS_URL = `${BASE_URL}/projects`;
const OUTPUT_DIR = join(process.cwd(), 'output');
const SESSION_DIR = join(process.cwd(), '.browser-session');

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(SESSION_DIR, { recursive: true });

const apiRequests = [];
const frameworkHints = [];

async function main() {
  console.log('========================================');
  console.log('RunningHub Video Platform - Tech Analysis');
  console.log('========================================\n');

  // First try to launch with chrome channel, fallback to chromium
  let browser;
  try {
    console.log('🔧 Launching browser (trying Chrome channel)...');
    browser = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: true,
      channel: 'chrome',
      viewport: { width: 1920, height: 1080 },
    });
    console.log('   ✅ Using system Chrome\n');
  } catch (e) {
    console.log('   ⚠️ Chrome not available, falling back to Playwright Chromium...');
    browser = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: true,
      viewport: { width: 1920, height: 1080 },
    });
    console.log('   ✅ Using Playwright Chromium\n');
  }

  const page = await browser.newPage();

  // ===== Network Interception =====
  page.on('request', (req) => {
    const url = req.url();
    const rt = req.resourceType();
    if (rt === 'xhr' || rt === 'fetch' || url.includes('/api/') || url.includes('graphql')) {
      apiRequests.push({
        url,
        method: req.method(),
        headers: req.headers(),
        postData: req.postData(),
        timestamp: new Date().toISOString(),
        resourceType: rt,
      });
    }
  });

  page.on('response', async (resp) => {
    const url = resp.url();
    const rt = resp.request().resourceType();
    if (rt === 'xhr' || rt === 'fetch' || url.includes('/api/') || url.includes('graphql')) {
      const existing = apiRequests.find(
        (r) => r.url === url && r.method === resp.request().method() && !r.status
      );
      if (existing) {
        existing.status = resp.status();
        existing.responseHeaders = resp.headers();
        try {
          const ct = resp.headers()['content-type'] || '';
          if (ct.includes('json')) {
            existing.responseBody = await resp.json().catch(() => null);
          }
        } catch {}
      }
    }
  });

  page.on('domcontentloaded', async () => {
    try {
      const html = await page.content();
      if (html.includes('__NEXT_DATA__') || html.includes('/_next/')) frameworkHints.push('Next.js');
      if (html.includes('id="__nuxt"') || html.includes('window.__NUXT__')) frameworkHints.push('Nuxt.js');
      if (html.includes('data-v-') && html.includes('__vue__')) frameworkHints.push('Vue.js');
      if (html.includes('react-dom') || html.includes('_reactRoot')) frameworkHints.push('React');
      if (html.includes('ng-version')) frameworkHints.push('Angular');
      if (html.includes('tailwind')) frameworkHints.push('Tailwind CSS');
    } catch {}
  });

  try {
    // =====================================================================
    // STEP 1: Navigate to projects page
    // =====================================================================
    console.log('📄 [Step 1] Loading projects page...');
    const resp = await page.goto(PROJECTS_URL, { waitUntil: 'networkidle', timeout: 60000 });
    console.log(`   Status: ${resp?.status()}, Final URL: ${page.url()}\n`);

    // Handle login redirect
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/signin') || currentUrl.includes('/auth')) {
      console.log('⚠️  Page redirected to login. This site requires authentication.');
      console.log('   The session stored in .browser-session/ does not have valid cookies.');
      console.log('   Options:');
      console.log('   1. Manually log in and save session cookies');
      console.log('   2. Use an existing authenticated browser profile\n');

      await page.screenshot({ path: join(OUTPUT_DIR, '01-login-page.png'), fullPage: true });
      console.log('   Login page screenshot saved.\n');

      // Still try to extract what we can from the login page
      await analyzeCurrentPage(page, 'login');

      // Save cookies for potential future use
      const cookies = await browser.cookies();
      writeFileSync(join(OUTPUT_DIR, 'cookies.json'), JSON.stringify(cookies, null, 2));
      console.log('   Cookies saved to cookies.json');
    } else {
      // Successfully loaded authenticated page
      await page.screenshot({ path: join(OUTPUT_DIR, '01-projects-page.png'), fullPage: true });
      await analyzeCurrentPage(page, 'projects');

      // Try to perform video generation
      await tryVideoGeneration(page);

      // Explore other pages
      await exploreOtherPages(page);
    }

    // =====================================================================
    // STEP: Tech Stack Analysis
    // =====================================================================
    await analyzeTechStack(page);

    // =====================================================================
    // STEP: API Analysis
    // =====================================================================
    await analyzeAPI();

    // =====================================================================
    // FINAL SUMMARY
    // =====================================================================
    printFinalSummary();

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    await page.screenshot({ path: join(OUTPUT_DIR, 'error-state.png'), fullPage: true });
  } finally {
    await browser.close();
    console.log('\n✅ Analysis complete!');
    console.log(`   All output files saved to: ${OUTPUT_DIR}/`);
  }
}

// ---- Helper Functions ----

async function analyzeCurrentPage(page, label) {
  console.log(`🔍 [${label}] Analyzing page structure...\n`);
  await page.waitForTimeout(2000);

  const title = await page.title();
  console.log(`   Page Title: "${title}"`);

  const data = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a[role="button"], [class*="btn"]'))
      .map((el) => ({ text: el.textContent?.trim().substring(0, 100), tag: el.tagName, className: el.className?.substring(0, 100) }))
      .filter((b) => b.text);

    const inputs = Array.from(document.querySelectorAll('input, textarea, select')).map((el) => ({
      type: el.type || el.tagName,
      name: el.name || '',
      placeholder: el.placeholder || '',
      className: el.className?.substring(0, 100),
    }));

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4')).map((h) => ({
      tag: h.tagName,
      text: h.textContent?.trim().substring(0, 200),
    }));

    const scripts = Array.from(document.querySelectorAll('script[src]')).map((s) => s.src);

    return { buttons, inputs, headings, scripts };
  });

  // Print summary
  console.log(`   Scripts loaded: ${data.scripts.length}`);
  console.log(`   Buttons: ${data.buttons.length}`);
  data.buttons.slice(0, 20).forEach((b) => console.log(`     [${b.tag}] "${b.text}"`));

  if (data.headings.length > 0) {
    console.log(`   Headings:`);
    data.headings.forEach((h) => console.log(`     ${h.tag}: "${h.text}"`));
  }

  if (data.inputs.length > 0) {
    console.log(`   Inputs:`);
    data.inputs.forEach((i) => console.log(`     [${i.type}] name="${i.name}" placeholder="${i.placeholder}"`));
  }

  // Save
  writeFileSync(join(OUTPUT_DIR, `${label}-data.json`), JSON.stringify(data, null, 2));
  console.log(`   Data saved to ${label}-data.json\n`);

  return data;
}

async function tryVideoGeneration(page) {
  console.log('🎬 [Step 2] Attempting video generation workflow...\n');

  // Find creation buttons
  const buttons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, a')).map((el) => ({
      text: el.textContent?.trim().substring(0, 100),
      tag: el.tagName,
      href: el.href || '',
      id: el.id || '',
      className: el.className?.substring(0, 100) || '',
    }))
  );

  const createBtn = buttons.find(
    (b) =>
      b.text &&
      (b.text.includes('创建') ||
        b.text.includes('新建') ||
        b.text.includes('生成') ||
        b.text.includes('制作') ||
        b.text.includes('Create') ||
        b.text.includes('New') ||
        b.text.includes('Generate'))
  );

  if (createBtn) {
    console.log(`   Found creation button: "${createBtn.text}"`);
    console.log(`   Attempting click...`);

    try {
      if (createBtn.href && createBtn.href !== '#' && !createBtn.href.startsWith('javascript')) {
        await page.goto(createBtn.href, { waitUntil: 'networkidle', timeout: 15000 });
        console.log(`   Navigated to: ${page.url()}`);
      } else {
        const clicked = await page
          .locator(`button:has-text("${createBtn.text}")`)
          .or(page.locator(`a:has-text("${createBtn.text}")`))
          .first()
          .click({ timeout: 5000 })
          .then(() => true)
          .catch(() => false);

        if (!clicked) {
          const allBtns = await page.$$('button');
          for (const btn of allBtns) {
            const t = await btn.textContent();
            if (t && t.includes(createBtn.text.substring(0, 6))) {
              await btn.click();
              break;
            }
          }
        }
      }

      await page.waitForTimeout(3000);
      await page.screenshot({ path: join(OUTPUT_DIR, '02-create-flow.png'), fullPage: true });

      // Analyze what appeared
      const newPage = await page.evaluate(() => {
        const modals = Array.from(
          document.querySelectorAll('[class*="modal"], [class*="dialog"], [class*="drawer"], [role="dialog"], [class*="popup"]')
        ).map((m) => ({
          className: m.className?.substring(0, 150),
          text: m.textContent?.substring(0, 500),
          visible: getComputedStyle(m).display !== 'none',
        }));

        const forms = Array.from(document.querySelectorAll('form, [class*="form"], [class*="upload"]')).map((f) => ({
          tag: f.tagName,
          className: f.className?.substring(0, 150),
        }));

        const uploadInputs = Array.from(document.querySelectorAll('input[type="file"], [class*="upload"] input')).map(
          (i) => ({
            accept: i.accept || '',
            className: i.className?.substring(0, 100),
          })
        );

        const allButtons = Array.from(document.querySelectorAll('button')).map((b) => ({
          text: b.textContent?.trim().substring(0, 100),
          className: b.className?.substring(0, 100),
        }));

        return { modals, forms, uploadInputs, allButtons };
      });

      console.log(`   Modal/Dialog elements: ${newPage.modals.length}`);
      newPage.modals.forEach((m) => console.log(`     - visible=${m.visible}: "${m.text?.substring(0, 150)}"`));

      console.log(`   Forms: ${newPage.forms.length}`);
      console.log(`   Upload inputs: ${newPage.uploadInputs.length}`);
      newPage.uploadInputs.forEach((u) => console.log(`     accept="${u.accept}"`));

      console.log(`   Buttons after navigation:`);
      newPage.allButtons.slice(0, 15).forEach((b) => console.log(`     - "${b.text}"`));

      writeFileSync(join(OUTPUT_DIR, 'create-flow-data.json'), JSON.stringify(newPage, null, 2));
    } catch (err) {
      console.log(`   ❌ Click/navigation failed: ${err.message}`);
    }
  } else {
    console.log('   No create/generate button found on this page.');
    console.log('   The page might be a listing/management page.\n');

    // Look for project list items
    const items = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="project"], [class*="item"], [class*="card"], li')).map((el) => ({
        className: el.className?.substring(0, 120),
        text: el.textContent?.trim().substring(0, 200),
      }))
    );
    console.log(`   Found ${items.length} potential project/list items`);
    items.slice(0, 8).forEach((i) => console.log(`     - "${i.text?.substring(0, 80)}"`));
  }
}

async function exploreOtherPages(page) {
  console.log('\n🌐 [Step 3] Exploring related pages...\n');

  const paths = ['/', '/workspace', '/editor', '/api-docs', '/docs'];

  for (const path of paths) {
    try {
      const url = `${BASE_URL}${path}`;
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
      const status = resp?.status() || 'N/A';
      if (status === 200) {
        console.log(`   ✅ ${url}`);
        const h1 = await page.$eval('h1', (el) => el.textContent?.trim()).catch(() => null);
        if (h1) console.log(`      H1: "${h1}"`);
      } else {
        console.log(`   ⚠️ ${url} → ${status}`);
      }
    } catch {
      // Skip failed pages silently
    }
  }
}

async function analyzeTechStack(page) {
  console.log('\n🔧 [Step 4] Tech Stack Analysis...\n');

  // Collect all script src URLs from all pages visited
  const scripts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[src]')).map((s) => s.src)
  );

  console.log(`   Total script bundles: ${scripts.length}`);

  // Categorize
  const tech = {
    framework: findIn(scripts, ['next', '__next'], scripts) ||
               findIn(scripts, ['nuxt', '__nuxt']) ||
               findIn(scripts, ['vue']) ||
               findIn(scripts, ['react']) ||
               findIn(scripts, ['angular']) ||
               'Unknown',
    uiLibrary: findIn(scripts, ['antd', 'ant-design']) ||
               findIn(scripts, ['element-plus', 'element-ui']) ||
               findIn(scripts, ['arco']) ||
               findIn(scripts, ['tdesign']) ||
               findIn(scripts, ['naive-ui', 'naive']) ||
               'Unknown',
    stateManagement: findIn(scripts, ['pinia']) ||
                     findIn(scripts, ['vuex']) ||
                     findIn(scripts, ['redux']) ||
                     findIn(scripts, ['zustand']) ||
                     findIn(scripts, ['jotai']) ||
                     'Unknown',
    buildTool: findIn(scripts, ['vite']) ||
               findIn(scripts, ['webpack']) ||
               'Unknown',
    cssFramework: findIn(scripts, ['tailwind']) ||
                   findIn(scripts, ['unocss']) ||
                   findIn(scripts, ['windi']) ||
                   'Unknown',
  };

  // Print key script files
  console.log('\n   Key Script Files:');
  const interesting = scripts.filter(
    (s) =>
      s.includes('main') ||
      s.includes('app') ||
      s.includes('vendor') ||
      s.includes('chunk') ||
      s.includes('index')
  );
  interesting.forEach((s) => {
    try {
      const url = new URL(s);
      console.log(`     ${url.pathname.split('/').pop()}`);
    } catch {
      console.log(`     ${s}`);
    }
  });

  console.log('\n   Detected Technologies:');
  for (const [key, value] of Object.entries(tech)) {
    console.log(`     ${key}: ${value}`);
  }

  // Check HTML for SSR indicators
  const hasSSR = await page.evaluate(() => {
    const html = document.documentElement.innerHTML;
    return {
      nextData: html.includes('__NEXT_DATA__'),
      nuxtData: html.includes('__NUXT__'),
      hasHydration: html.includes('data-hydrate') || html.includes('hydrate'),
      preRendered: html.includes('prerendered'),
    };
  });
  console.log(`     SSR/Hydration: ${JSON.stringify(hasSSR)}`);

  writeFileSync(join(OUTPUT_DIR, 'tech-stack.json'), JSON.stringify({ tech, scripts, hasSSR }, null, 2));
}

function findIn(scripts, keywords, allScripts) {
  for (const script of scripts || []) {
    for (const kw of keywords) {
      if (script.toLowerCase().includes(kw.toLowerCase())) return kw;
    }
  }
  return null;
}

async function analyzeAPI() {
  console.log('\n📡 [Step 5] API Analysis...\n');

  console.log(`   Total API/XHR requests captured: ${apiRequests.length}`);

  // Categorize endpoints
  const categories = {
    '🔐 Auth': (url) => url.includes('auth') || url.includes('login') || url.includes('token') || url.includes('oauth'),
    '👤 User': (url) => url.includes('user') || url.includes('profile') || url.includes('account'),
    '📁 Projects': (url) => url.includes('project'),
    '🎬 Template/Scene': (url) => url.includes('template') || url.includes('scene'),
    '📤 Upload': (url) => url.includes('upload'),
    '🎥 Generate/Video': (url) => url.includes('generate') || url.includes('video') || url.includes('render') || url.includes('frame'),
    '📋 Task/Queue': (url) => url.includes('task') || url.includes('queue') || url.includes('status') || url.includes('job'),
    '📄 File/Asset': (url) => url.includes('file') || url.includes('asset') || url.includes('media') || url.includes('image'),
    '⚙️ Config': (url) => url.includes('config') || url.includes('setting') || url.includes('preference'),
    '💳 Payment/Plan': (url) => url.includes('pay') || url.includes('plan') || url.includes('billing') || url.includes('subscription'),
    '🔌 WebSocket': (url) => url.startsWith('ws://') || url.startsWith('wss://'),
    '📊 Analytics': (url) => url.includes('analytics') || url.includes('track') || url.includes('event'),
    '🤖 AI/Model': (url) => url.includes('model') || url.includes('ai') || url.includes('inference') || url.includes('llm'),
    '🔄 Other': () => true,
  };

  console.log('\n   Endpoint Categories:');
  const categorized = {};

  for (const req of apiRequests) {
    let matched = false;
    for (const [cat, fn] of Object.entries(categories)) {
      if (fn(req.url)) {
        if (!categorized[cat]) categorized[cat] = [];
        if (!categorized[cat].find((r) => r.url === req.url)) {
          categorized[cat].push(req);
        }
        matched = true;
        break;
      }
    }
  }

  for (const [cat, reqs] of Object.entries(categorized)) {
    if (reqs.length > 0) {
      console.log(`\n   ${cat} (${reqs.length} unique):`);
      reqs.slice(0, 8).forEach((r) => {
        console.log(`      ${r.method} ${r.url} → ${r.status || 'N/A'}`);
      });
      if (reqs.length > 8) console.log(`      ... and ${reqs.length - 8} more`);
    }
  }

  // API base URLs
  const origins = new Set();
  for (const req of apiRequests) {
    try {
      origins.add(new URL(req.url).origin);
    } catch {}
  }
  console.log(`\n   API Base URLs: ${[...origins].join(', ')}`);

  // Auth methods
  const authHeaders = new Set();
  for (const req of apiRequests) {
    if (req.headers) {
      if (req.headers.authorization) authHeaders.add('Bearer Token / Authorization Header');
      if (req.headers.cookie || req.headers['set-cookie']) authHeaders.add('Cookie-based Session');
      if (req.headers['x-api-key']) authHeaders.add('API Key Header');
    }
  }
  console.log(`   Auth Methods: ${[...authHeaders].join(', ') || 'Not detected'}`);

  // Response patterns
  const responsePatterns = new Set();
  for (const req of apiRequests) {
    if (req.responseBody) {
      if (req.responseBody.code !== undefined) responsePatterns.add('{code, data, message} pattern');
      if (req.responseBody.success !== undefined) responsePatterns.add('{success, data, error} pattern');
      if (req.responseBody.status !== undefined) responsePatterns.add('{status, result} pattern');
      if (req.responseBody.error !== undefined) responsePatterns.add('{error, ...} pattern');
      if (req.responseBody.data && req.responseBody.pagination) responsePatterns.add('Paginated responses');
    }
  }
  console.log(`   Response Patterns: ${[...responsePatterns].join(', ') || 'Not enough data'}`);

  // Save detailed API log
  writeFileSync(join(OUTPUT_DIR, 'api-requests.json'), JSON.stringify(apiRequests, null, 2));
  writeFileSync(join(OUTPUT_DIR, 'api-categorized.json'), JSON.stringify(categorized, null, 2));
  console.log('\n   Detailed API logs saved to api-requests.json and api-categorized.json');
}

function printFinalSummary() {
  const uniqueEndpoints = new Set(apiRequests.map((r) => r.url)).size;

  console.log('\n========================================');
  console.log('           📊 FINAL SUMMARY              ');
  console.log('========================================\n');
  console.log(`   API Requests Captured: ${apiRequests.length}`);
  console.log(`   Unique API Endpoints:  ${uniqueEndpoints}`);
  console.log(`   Framework Hints:       ${[...new Set(frameworkHints)].join(', ') || 'None detected'}`);
  console.log(`   Output Files Location: ${OUTPUT_DIR}/`);
  console.log('\n   Output Files:');
  try {
    const files = readdirSync(OUTPUT_DIR);
    files.forEach((f) => console.log(`     - ${f}`));
  } catch {}
}

main().catch(console.error);

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'https://rhtv.runninghub.cn';
const OUTPUT_DIR = join(process.cwd(), 'output');
const SESSION_DIR = join(process.cwd(), '.browser-session');

mkdirSync(OUTPUT_DIR, { recursive: true });

const apiRequests = [];
const allNetworkLogs = [];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('========================================');
  console.log('RunningHub - Deep Analysis Round 2');
  console.log('========================================\n');

  let browser;

  // Try using actual Chrome user data for persistent login
  console.log('🔧 Attempting to use Chrome user profile for persistent login...');

  const chromeUserDataDir = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data')
    : null;

  try {
    if (chromeUserDataDir) {
      console.log(`   Chrome profile: ${chromeUserDataDir}`);
    }
    browser = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: true,
      channel: 'chrome',
      viewport: { width: 1920, height: 1080 },
    });
    console.log('   ✅ Using system Chrome\n');
  } catch (e) {
    console.log('   ⚠️ Falling back to Playwright Chromium...');
    browser = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: true,
      viewport: { width: 1920, height: 1080 },
    });
    console.log('   ✅ Using Playwright Chromium\n');
  }

  const page = await browser.newPage();

  // Capture ALL network requests (not just XHR)
  page.on('request', (req) => {
    const url = req.url();
    const rt = req.resourceType();
    allNetworkLogs.push({
      url, method: req.method(), resourceType: rt,
      timestamp: new Date().toISOString(),
    });
    if (rt === 'xhr' || rt === 'fetch' || url.includes('/api/') || url.includes('graphql')) {
      apiRequests.push({
        url, method: req.method(),
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
      const existing = apiRequests.find(r => r.url === url && r.method === resp.request().method() && !r.status);
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

  try {
    // ================================================================
    // STEP 1: Load projects page
    // ================================================================
    console.log('📄 [Step 1] Loading projects page...');
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(3000);
    await page.screenshot({ path: join(OUTPUT_DIR, '01-initial.png'), fullPage: true });
    console.log(`   URL: ${page.url()}\n`);

    // ================================================================
    // STEP 2: Handle login modal
    // ================================================================
    console.log('🔐 [Step 2] Handling login modal...');

    // Check if login modal is visible
    const hasLoginModal = await page.evaluate(() => {
      const modal = document.querySelector('.loginAndRegisterModal, .ant-modal-wrap');
      if (!modal) return false;
      const style = getComputedStyle(modal);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

    if (hasLoginModal) {
      console.log('   Login modal detected!');
      console.log('   Attempting to dismiss modal...');

      // Try different ways to close the modal
      const closeAttempts = [
        // 1. Click close button (X)
        async () => {
          const closeBtn = await page.$('.ant-modal-close, [class*="modal-close"], [class*="close-btn"]');
          if (closeBtn) {
            await closeBtn.click();
            return true;
          }
          return false;
        },
        // 2. Click modal backdrop/mask
        async () => {
          const mask = await page.$('.ant-modal-mask, .ant-modal-wrap');
          if (mask) {
            await mask.click({ position: { x: 10, y: 10 } });
            return true;
          }
          return false;
        },
        // 3. Press Escape key
        async () => {
          await page.keyboard.press('Escape');
          return true;
        },
        // 4. Use JS to hide the modal
        async () => {
          await page.evaluate(() => {
            const modals = document.querySelectorAll('.ant-modal-wrap, .ant-modal-mask, .loginAndRegisterModal');
            modals.forEach(m => { m.style.display = 'none'; m.remove(); });
          });
          return true;
        },
      ];

      let modalGone = false;
      for (const attempt of closeAttempts) {
        try {
          await attempt();
          await sleep(1000);
          const stillVisible = await page.evaluate(() => {
            const modal = document.querySelector('.loginAndRegisterModal, .ant-modal-wrap:not([style*="display: none"])');
            return !!modal;
          });
          if (!stillVisible) {
            modalGone = true;
            console.log('   ✅ Login modal dismissed!');
            break;
          }
        } catch (e) {
          console.log(`   Attempt failed: ${e.message}`);
        }
      }

      if (!modalGone) {
        console.log('   ⚠️ Could not dismiss modal. Trying force removal...');
        await page.evaluate(() => {
          document.querySelectorAll('.ant-modal-root, .ant-modal-wrap, .ant-modal-mask, .loginAndRegisterModal').forEach(el => el.remove());
        });
        await sleep(1000);
      }
    } else {
      console.log('   No login modal detected. Already authenticated!');
    }

    await page.screenshot({ path: join(OUTPUT_DIR, '02-modal-dismissed.png'), fullPage: true });

    // ================================================================
    // STEP 3: Analyze page after modal
    // ================================================================
    console.log('\n🔍 [Step 3] Post-modal page analysis...\n');

    const pageInfo = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.textContent?.trim().substring(0, 100),
        className: b.className?.substring(0, 150),
      }));
      const links = Array.from(document.querySelectorAll('a[href]:not([href="#"])')).map(a => ({
        text: a.textContent?.trim().substring(0, 80),
        href: a.href,
      }));
      const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4')).map(h => ({
        tag: h.tagName,
        text: h.textContent?.trim().substring(0, 200),
      }));
      const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
      const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href);
      const metas = Array.from(document.querySelectorAll('meta')).map(m => ({
        name: m.name || m.getAttribute('property') || '',
        content: m.content || '',
      }));
      return { buttons, links, headings, scripts, styles, metas };
    });

    console.log(`   Scripts: ${pageInfo.scripts.length}`);
    pageInfo.scripts.forEach(s => console.log(`     ${s}`));

    console.log(`\n   Stylesheets: ${pageInfo.styles.length}`);
    pageInfo.styles.forEach(s => console.log(`     ${s}`));

    console.log(`\n   Headings:`);
    pageInfo.headings.forEach(h => console.log(`     ${h.tag}: "${h.text}"`));

    console.log(`\n   Action Buttons:`);
    pageInfo.buttons.filter(b => b.text).slice(0, 20).forEach(b => console.log(`     "${b.text}" [${b.className}]`));

    console.log(`\n   Key Links:`);
    pageInfo.links.slice(0, 15).forEach(l => console.log(`     "${l.text}" → ${l.href}`));

    writeFileSync(join(OUTPUT_DIR, 'page-info.json'), JSON.stringify(pageInfo, null, 2));

    // ================================================================
    // STEP 4: Try to execute a creation flow
    // ================================================================
    console.log('\n🎬 [Step 4] Attempting creation workflow...\n');

    // Try to click "手动生成" button
    const generateBtns = pageInfo.buttons.filter(b => b.text && (b.text.includes('手动生成') || b.text.includes('Agent模式')));
    console.log(`   Generation buttons found: ${generateBtns.map(b => b.text).join(', ')}`);

    if (generateBtns.length > 0) {
      for (const gb of generateBtns) {
        try {
          console.log(`   Clicking: "${gb.text}"...`);
          await page.locator(`button:has-text("${gb.text}")`).first().click({ timeout: 10000 });
          await sleep(3000);
          await page.screenshot({ path: join(OUTPUT_DIR, `03-click-${gb.text.replace(/\s/g, '-')}.png`), fullPage: true });

          // Check what changed
          const newState = await page.evaluate(() => {
            const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="drawer"]')).map(d => ({
              className: d.className?.substring(0, 150),
              text: d.textContent?.substring(0, 500),
            }));
            const newBtns = Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim().substring(0, 100));
            const newInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea')).map(i => ({
              type: i.type, placeholder: i.placeholder, name: i.name,
            }));
            return { dialogs, newBtns, newInputs };
          });

          console.log(`   Dialogs after click: ${newState.dialogs.length}`);
          newState.dialogs.forEach(d => console.log(`     "${d.text?.substring(0, 120)}"`));
          console.log(`   New inputs: ${newState.newInputs.length}`);
          newState.newInputs.forEach(i => console.log(`     [${i.type}] placeholder="${i.placeholder}" name="${i.name}"`));

          // If there are input fields, try to interact
          if (newState.newInputs.length > 0) {
            console.log('\n   Found input fields - the creation form is accessible!');
            writeFileSync(join(OUTPUT_DIR, 'creation-form.json'), JSON.stringify(newState, null, 2));
          }

          break; // Stop after first successful click
        } catch (e) {
          console.log(`   ❌ Failed: ${e.message}`);
        }
      }
    }

    // ================================================================
    // STEP 5: Try "新建项目"
    // ================================================================
    console.log('\n🆕 [Step 5] Try "新建项目"...');
    try {
      const newProjectBtn = await page.$('button:has-text("新建项目")');
      if (newProjectBtn) {
        await newProjectBtn.click();
        await sleep(3000);
        await page.screenshot({ path: join(OUTPUT_DIR, '04-new-project.png'), fullPage: true });
        console.log('   Clicked "新建项目"');
      }
    } catch (e) {
      console.log(`   Failed: ${e.message}`);
    }

    // ================================================================
    // STEP 6: Explore all tabs
    // ================================================================
    console.log('\n📑 [Step 6] Exploring tab navigation...\n');

    const tabs = ['聚光营地', '我的项目', '团队项目', '推荐模版'];
    for (const tab of tabs) {
      try {
        console.log(`   Clicking tab: "${tab}"...`);
        await page.locator(`.ant-tabs-tab-btn:has-text("${tab}")`).first().click({ timeout: 5000 });
        await sleep(2000);
        await page.screenshot({ path: join(OUTPUT_DIR, `tab-${tab}.png`), fullPage: true });

        const tabContent = await page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('[class*="card"], [class*="project"]')).map(c => ({
            text: c.textContent?.trim().substring(0, 200),
            className: c.className?.substring(0, 120),
          }));
          return { cards: cards.slice(0, 10) };
        });
        console.log(`   Cards: ${tabContent.cards.length}`);
        tabContent.cards.slice(0, 5).forEach(c => console.log(`     "${c.text?.substring(0, 80)}"`));
      } catch (e) {
        console.log(`   Tab "${tab}" click failed: ${e.message}`);
      }
    }

    // ================================================================
    // STEP 7: Navigate to workspace
    // ================================================================
    console.log('\n🏠 [Step 7] Exploring workspace...\n');
    await page.goto(`${BASE_URL}/workspace`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await sleep(3000);
    await page.screenshot({ path: join(OUTPUT_DIR, '05-workspace.png'), fullPage: true });

    const wsInfo = await page.evaluate(() => ({
      headings: Array.from(document.querySelectorAll('h1,h2,h3')).map(h => h.textContent?.trim()),
      buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim().substring(0, 80)),
      inputs: Array.from(document.querySelectorAll('input, textarea')).map(i => ({ type: i.type, placeholder: i.placeholder })),
    }));
    console.log(`   Headings: ${wsInfo.headings.join(' | ')}`);
    console.log(`   Buttons: ${wsInfo.buttons.filter(Boolean).slice(0, 15).join(', ')}`);
    console.log(`   Inputs: ${wsInfo.inputs.length}`);

    // ================================================================
    // STEP 8: API Analysis
    // ================================================================
    console.log('\n📡 [Step 8] API Analysis...\n');
    console.log(`   Total API/XHR calls: ${apiRequests.length}`);

    const byCategory = {};
    const categories = {
      'Auth': u => u.includes('auth') || u.includes('login') || u.includes('token') || u.includes('oauth'),
      'User': u => u.includes('user') || u.includes('profile'),
      'Project': u => u.includes('project'),
      'Template': u => u.includes('template') || u.includes('scene'),
      'Upload': u => u.includes('upload'),
      'Video/Generate': u => u.includes('video') || u.includes('generate') || u.includes('render') || u.includes('inference'),
      'Task': u => u.includes('task') || u.includes('queue') || u.includes('job'),
      'File': u => u.includes('file') || u.includes('asset') || u.includes('media'),
      'WebSocket': u => u.startsWith('ws'),
      'Config': u => u.includes('config') || u.includes('setting'),
    };

    for (const req of apiRequests) {
      let matched = false;
      for (const [cat, fn] of Object.entries(categories)) {
        if (fn(req.url)) {
          if (!byCategory[cat]) byCategory[cat] = [];
          if (!byCategory[cat].find(r => r.url === req.url && r.method === req.method)) {
            byCategory[cat].push(req);
          }
          matched = true;
          break;
        }
      }
      if (!matched) {
        if (!byCategory['Other']) byCategory['Other'] = [];
        byCategory['Other'].push(req);
      }
    }

    for (const [cat, reqs] of Object.entries(byCategory)) {
      if (reqs.length > 0) {
        console.log(`\n   ${cat} (${reqs.length}):`);
        const unique = [...new Set(reqs.map(r => `${r.method} ${r.url}`))];
        unique.slice(0, 10).forEach(u => console.log(`     ${u}`));
        if (unique.length > 10) console.log(`     ... +${unique.length - 10} more`);
      }
    }

    // Detect API bases
    const origins = [...new Set(apiRequests.map(r => {
      try { return new URL(r.url).origin; } catch { return r.url; }
    }))];
    console.log(`\n   API Base URLs: ${origins.join(', ')}`);

    // Auth mechanism
    const authHeaders = apiRequests.filter(r => r.headers?.authorization);
    const cookieAuth = apiRequests.filter(r => r.headers?.cookie);
    console.log(`   Requests with Auth header: ${authHeaders.length}`);
    console.log(`   Requests with Cookie: ${cookieAuth.length}`);

    // Response format analysis
    const responses = apiRequests.filter(r => r.responseBody);
    if (responses.length > 0) {
      const firstResp = responses[0].responseBody;
      console.log(`\n   Sample API Response Structure: ${JSON.stringify(Object.keys(firstResp || {}))}`);
    }

    writeFileSync(join(OUTPUT_DIR, 'api-requests.json'), JSON.stringify(apiRequests, null, 2));
    writeFileSync(join(OUTPUT_DIR, 'api-by-category.json'), JSON.stringify(byCategory, null, 2));
    writeFileSync(join(OUTPUT_DIR, 'all-network.json'), JSON.stringify(allNetworkLogs, null, 2));

  } catch (e) {
    console.error('❌ Error:', e.message);
    await page.screenshot({ path: join(OUTPUT_DIR, 'error.png'), fullPage: true });
  } finally {
    await browser.close();
    console.log('\n✅ Analysis complete!');
    const files = readdirSync(OUTPUT_DIR);
    console.log(`   Output (${files.length} files):`);
    files.forEach(f => console.log(`     - ${f}`));
  }
}

main().catch(console.error);

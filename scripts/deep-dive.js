import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'https://rhtv.runninghub.cn';
const OUTPUT_DIR = join(process.cwd(), 'output');
const SESSION_DIR = join(process.cwd(), '.browser-session');

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(SESSION_DIR, { recursive: true });

const apiRequests = [];

async function main() {
  console.log('========================================');
  console.log('RunningHub - Video Generation Deep Dive');
  console.log('========================================\n');

  // Try connecting to existing Chrome via CDP first
  let browser;
  let connectedViaCDP = false;

  try {
    console.log('🔧 Trying to connect to existing Chrome via CDP (port 9222)...');
    const cdpBrowser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('   ✅ Connected to existing Chrome session!\n');
    browser = cdpBrowser;
    connectedViaCDP = true;
  } catch {
    console.log('   ⚠️ No existing Chrome CDP found. Launching new browser...');
    browser = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: true,
      channel: 'chrome',
      viewport: { width: 1920, height: 1080 },
    });
    console.log('   ✅ New browser launched\n');
  }

  let page;
  if (connectedViaCDP) {
    const pages = browser.pages();
    page = pages.length > 0 ? pages[0] : await browser.newPage();
  } else {
    page = await browser.newPage();
  }

  // Network capture
  page.on('request', (req) => {
    const url = req.url();
    const rt = req.resourceType();
    if ((rt === 'xhr' || rt === 'fetch' || url.includes('/api/') || url.includes('/canvas/') || url.includes('/uc/')) && !url.includes('google-analytics') && !url.includes('baidu')) {
      apiRequests.push({
        url, method: req.method(),
        postData: req.postData(),
        timestamp: new Date().toISOString(),
      });
    }
  });

  page.on('response', async (resp) => {
    const url = resp.url();
    if (apiRequests.find(r => r.url === url && r.method === resp.request().method())) {
      const existing = apiRequests.find(r => r.url === url && r.method === resp.request().method() && !r.status);
      if (existing) {
        existing.status = resp.status();
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
    // Step 1: Load projects page
    console.log('📄 Loading projects page...');
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    const title = await page.title();
    console.log(`   Page: "${title}" URL: ${page.url()}\n`);

    // Check login state
    const hasLoginBtn = await page.$('button:has-text("登 录")');
    if (hasLoginBtn) {
      console.log('⚠️  NOT authenticated - "登 录" button visible');
    } else {
      console.log('✅ Appears to be authenticated');
    }

    // Step 2: Force dismiss login modal if present
    console.log('\n🔓 Ensuring login modal is closed...');
    await page.evaluate(() => {
      document.querySelectorAll('.ant-modal-root, .ant-modal-wrap, .ant-modal-mask').forEach(el => el.remove());
      document.querySelectorAll('.loginAndRegisterModal').forEach(el => el.remove());
      document.body.style.overflow = 'auto';
    });
    await page.waitForTimeout(1000);

    // Step 3: Click "手动生成" button
    console.log('\n🎬 Clicking "手动生成"...');
    try {
      await page.locator('button:has-text("手动生成")').first().click({ timeout: 5000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: join(OUTPUT_DIR, 'manual-mode.png'), fullPage: true });
      console.log('   Clicked successfully');
    } catch (e) {
      console.log(`   Click failed: ${e.message}`);
    }

    // Step 4: Analyze current state - what appeared?
    const state = await page.evaluate(() => {
      const allBtns = Array.from(document.querySelectorAll('button, [role="button"]')).map(b => ({
        text: b.textContent?.trim().substring(0, 150),
        className: b.className?.substring(0, 150),
      }));

      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select')).map(i => ({
        type: i.type || i.tagName,
        placeholder: i.placeholder || '',
        name: i.name || '',
        className: i.className?.substring(0, 100),
      }));

      const textareas = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')).map(t => ({
        className: t.className?.substring(0, 100),
        placeholder: t.placeholder || t.getAttribute('placeholder') || '',
      }));

      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="drawer"], [class*="popup"]'))
        .filter(d => getComputedStyle(d).display !== 'none')
        .map(d => ({
          className: d.className?.substring(0, 150),
          text: d.textContent?.substring(0, 500),
        }));

      const uploadElements = Array.from(document.querySelectorAll('[class*="upload"], input[type="file"]')).map(u => ({
        className: u.className?.substring(0, 100),
        tag: u.tagName,
      }));

      return { buttons: allBtns, inputs, textareas, dialogs, uploadElements };
    });

    console.log('\n📊 Current Page State:');
    console.log(`   Text Inputs: ${state.inputs.length}`);
    state.inputs.forEach(i => console.log(`     [${i.type}] "${i.placeholder}" name="${i.name}" class="${i.className}"`));
    console.log(`   Textareas/Editables: ${state.textareas.length}`);
    state.textareas.forEach(t => console.log(`     "${t.placeholder}" class="${t.className}"`));
    console.log(`   Upload Elements: ${state.uploadElements.length}`);
    state.uploadElements.forEach(u => console.log(`     [${u.tag}] class="${u.className}"`));
    console.log(`   Visible Buttons:`);
    state.buttons.filter(b => b.text).slice(0, 25).forEach(b => console.log(`     "${b.text}"`));

    writeFileSync(join(OUTPUT_DIR, 'manual-mode-state.json'), JSON.stringify(state, null, 2));

    // Step 5: Try to interact with the text input (AI prompt)
    console.log('\n📝 Attempting to enter a generation prompt...');

    // Look for text input/textarea
    const textInput = await page.$('textarea, [role="textbox"], [contenteditable="true"], input[type="text"]');
    if (textInput) {
      try {
        await textInput.click();
        await page.waitForTimeout(500);
        await textInput.fill('生成一个30秒的电视广告视频，包含产品展示和品牌logo动画');
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(OUTPUT_DIR, 'prompt-entered.png'), fullPage: true });
        console.log('   ✅ Prompt entered!');
      } catch (e) {
        console.log(`   Fill failed: ${e.message}, trying keyboard input...`);
        await page.keyboard.type('生成一个30秒的电视广告视频，包含产品展示和品牌logo动画', { delay: 50 });
      }
    } else {
      console.log('   No text input found. Trying to trigger prompt input...');

      // Try clicking "Agent模式" to trigger the AI input
      try {
        await page.locator('button:has-text("Agent模式")').first().click({ timeout: 3000 });
        await page.waitForTimeout(2000);

        const textInputAfter = await page.$('textarea, [role="textbox"], [contenteditable="true"]');
        if (textInputAfter) {
          await textInputAfter.fill('创建一个电视广告视频');
          console.log('   ✅ Prompt entered after mode switch!');
        }
      } catch (e) {
        console.log(`   Mode switch failed: ${e.message}`);
      }
    }

    // Step 6: Try clicking GO/send button
    console.log('\n🚀 Trying to submit generation...');
    try {
      const sendBtn = await page.$('button:has-text("GO"), button:has-text("生成"), button:has-text("开始"), button.home-send-btn');
      if (sendBtn) {
        await sendBtn.click();
        await page.waitForTimeout(5000);
        await page.screenshot({ path: join(OUTPUT_DIR, 'generation-submitted.png'), fullPage: true });
        console.log('   ✅ Submit clicked!');

        // Check for task status
        const taskState = await page.evaluate(() => {
          const statusElements = Array.from(document.querySelectorAll('[class*="status"], [class*="progress"], [class*="task"], [class*="result"], [class*="loading"]')).map(e => ({
            text: e.textContent?.trim().substring(0, 300),
            className: e.className?.substring(0, 150),
          }));
          return statusElements;
        });
        console.log(`   Task indicators: ${taskState.length}`);
        taskState.forEach(t => console.log(`     "${t.text?.substring(0, 150)}"`));
      } else {
        console.log('   No submit button found');

        // Look for all visible buttons
        const visibleBtns = await page.evaluate(() =>
          Array.from(document.querySelectorAll('button')).filter(b => {
            const s = getComputedStyle(b);
            return s.display !== 'none' && s.visibility !== 'hidden' && b.offsetWidth > 0;
          }).map(b => b.textContent?.trim().substring(0, 100))
        );
        console.log(`   Visible buttons: ${visibleBtns.filter(Boolean).join(' | ')}`);
      }
    } catch (e) {
      console.log(`   Submit failed: ${e.message}`);
    }

    // Step 7: Try "新建项目" flow
    console.log('\n🆕 Trying "新建项目" flow...');
    try {
      await page.goto(`${BASE_URL}/projects`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.evaluate(() => {
        document.querySelectorAll('.ant-modal-root, .ant-modal-wrap, .ant-modal-mask, .loginAndRegisterModal').forEach(el => el.remove());
      });
      await page.waitForTimeout(1000);

      const newBtn = await page.$('button:has-text("新建项目")');
      if (newBtn) {
        await newBtn.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: join(OUTPUT_DIR, 'new-project-flow.png'), fullPage: true });

        const newState = await page.evaluate(() => ({
          buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim().substring(0, 100)),
          inputs: Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea')).map(i => ({
            type: i.type, placeholder: i.placeholder, name: i.name,
          })),
          dialogs: Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"]')).map(d => ({
            text: d.textContent?.substring(0, 500),
            visible: getComputedStyle(d).display !== 'none',
          })),
        }));

        console.log(`   Buttons: ${newState.buttons.filter(Boolean).join(' | ')}`);
        console.log(`   Inputs: ${JSON.stringify(newState.inputs)}`);
        console.log(`   Dialogs: ${newState.dialogs.length}`);
        newState.dialogs.forEach(d => console.log(`     visible=${d.visible}: "${d.text?.substring(0, 200)}"`));

        writeFileSync(join(OUTPUT_DIR, 'new-project-state.json'), JSON.stringify(newState, null, 2));
      }
    } catch (e) {
      console.log(`   New project flow failed: ${e.message}`);
    }

    // Final API Analysis
    console.log('\n📡 ===== Captured API Calls =====');
    const runninghubAPIs = apiRequests.filter(r => r.url.includes('runninghub.cn'));
    const uniqueAPIs = [...new Set(runninghubAPIs.map(r => `${r.method} ${r.url}`))];

    console.log(`\n   RunningHub API calls: ${runninghubAPIs.length} (${uniqueAPIs.length} unique)`);

    // Categorize by endpoint
    const byPath = {};
    for (const api of uniqueAPIs) {
      try {
        const path = new URL(api.split(' ')[1]).pathname;
        const parts = path.split('/').filter(Boolean);
        const key = parts.slice(0, 3).join('/');
        if (!byPath[key]) byPath[key] = [];
        byPath[key].push(api);
      } catch {}
    }

    for (const [key, apis] of Object.entries(byPath)) {
      console.log(`\n   /${key}/`);
      apis.forEach(a => console.log(`     ${a}`));
    }

    // Check response bodies
    const withResponses = runninghubAPIs.filter(r => r.responseBody);
    console.log(`\n   APIs with response bodies captured: ${withResponses.length}`);
    withResponses.slice(0, 5).forEach(r => {
      console.log(`     ${r.method} ${r.url} → ${r.status}`);
      console.log(`       Response keys: ${JSON.stringify(Object.keys(r.responseBody || {}))}`);
      if (r.responseBody) {
        const sample = JSON.stringify(r.responseBody).substring(0, 300);
        console.log(`       Sample: ${sample}`);
      }
    });

    writeFileSync(join(OUTPUT_DIR, 'api-detailed.json'), JSON.stringify(runninghubAPIs, null, 2));

  } catch (e) {
    console.error('❌ Error:', e.message);
    await page.screenshot({ path: join(OUTPUT_DIR, 'error-final.png'), fullPage: true });
  } finally {
    if (!connectedViaCDP) {
      await browser.close();
    }
    console.log('\n✅ Deep dive complete!');
  }
}

main().catch(console.error);

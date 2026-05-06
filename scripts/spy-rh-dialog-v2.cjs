/**
 * RunningHub 对话框深度监控 v2
 * 不拦截请求，纯观察模式 + Console 日志捕获
 */
const { chromium } = require('playwright');
const { mkdirSync, writeFileSync, appendFileSync } = require('fs');
const { join } = require('path');

const TARGET_URL = 'https://www.runninghub.cn/projects/';
const OUTPUT_DIR = join(__dirname, '..', 'output', 'rh-spy');
const SESSION_DIR = join(__dirname, '..', '.browser-session-rh');

mkdirSync(OUTPUT_DIR, { recursive: true });

const LOG_FILE = join(OUTPUT_DIR, 'spy-log-v2.txt');
const API_ALL = join(OUTPUT_DIR, 'api-all-v2.json');
const SSE_DATA = join(OUTPUT_DIR, 'sse-data-v2.json');
const CONSOLE_LOG = join(OUTPUT_DIR, 'console-v2.txt');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + '\n');
}

const allRequests = [];
const sseEvents = [];
let reqId = 0;

async function main() {
  log('===== RunningHub Dialog Spy v2 =====');
  log(`Target: ${TARGET_URL}`);
  log('Mode: Passive observation (no route interception)');
  log('');

  const browser = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = await browser.newPage();

  // ---- Capture ALL console messages ----
  page.on('console', (msg) => {
    const text = msg.text();
    appendFileSync(CONSOLE_LOG, `[${msg.type()}] ${text}\n`);
    if (text.includes('error') || text.includes('Error') || text.includes('fail') || text.includes('api')) {
      log(`📟 Console: [${msg.type()}] ${text.substring(0, 300)}`);
    }
  });

  page.on('pageerror', (err) => {
    log(`❌ Page Error: ${err.message}`);
    appendFileSync(CONSOLE_LOG, `[PAGE_ERROR] ${err.message}\n${err.stack}\n`);
  });

  // ---- Pure observation: capture requests (no route()) ----
  page.on('request', (req) => {
    const url = req.url();
    const rt = req.resourceType();
    const method = req.method();

    // Skip static + analytics
    if (rt === 'image' || rt === 'media' || rt === 'font' || rt === 'stylesheet' ||
        url.includes('.js') || url.includes('.css') || url.includes('.ico') ||
        url.includes('google-analytics') || url.includes('googletagmanager') ||
        url.includes('baidu.com') || url.includes('detailroi.com')) {
      return;
    }

    const entry = {
      id: ++reqId,
      time: new Date().toISOString(),
      url,
      method,
      resourceType: rt,
    };

    try {
      const pd = req.postData();
      if (pd) {
        try { entry.postData = JSON.parse(pd); } catch { entry.postData = pd.substring(0, 2000); }
      }
    } catch {}

    allRequests.push(entry);

    // Log interesting ones immediately
    if (rt === 'xhr' || rt === 'fetch' || rt === 'eventsource' ||
        url.includes('/api/') || url.includes('/openapi/') || url.includes('/v2/') ||
        url.includes('stream') || url.includes('chat') || url.includes('generate') ||
        url.includes('submit') || url.includes('task') || url.includes('canvas') ||
        url.includes('workflow') || url.includes('agent') || url.includes('ai')) {
      log(`📡 ${method} ${url.substring(0, 150)}`);
      if (entry.postData) log(`   📤 ${JSON.stringify(entry.postData).substring(0, 300)}`);
    }
  });

  page.on('response', async (resp) => {
    const req = resp.request();
    const url = req.url();
    const rt = req.resourceType();

    if (rt === 'image' || rt === 'media' || rt === 'font' || rt === 'stylesheet' ||
        url.includes('.js') || url.includes('.css') || url.includes('.ico') ||
        url.includes('google-analytics') || url.includes('detailroi.com')) return;

    try {
      const ct = resp.headers()['content-type'] || '';
      let body = null;

      if (ct.includes('json')) {
        body = await resp.json().catch(() => null);
      } else if (ct.includes('text/event-stream')) {
        const text = await resp.text().catch(() => null);
        body = text?.substring(0, 5000);
        if (text) {
          sseEvents.push({ url, status: resp.status(), time: new Date().toISOString(), data: text.substring(0, 3000) });
          log(`🌊 SSE: ${url} → ${resp.status()} | ${text.substring(0, 200)}`);
        }
      }

      const entry = allRequests.find(r => r.url === url && r.method === req.method() && !r.status);
      if (entry) {
        entry.status = resp.status();
        entry.responseBody = body;
      }
    } catch {}
  });

  // ---- Capture WebSocket frames ----
  page.on('websocket', (ws) => {
    log(`🔌 WS: ${ws.url().substring(0, 120)}`);
    ws.on('framereceived', (frame) => {
      try {
        const text = typeof frame.payload === 'string' ? frame.payload : Buffer.from(frame.payload).toString('utf-8');
        if (text !== '2' && text !== '3') {
          log(`🔌 WS ← ${text.substring(0, 300)}`);
        }
      } catch {}
    });
    ws.on('framesent', (frame) => {
      try {
        const text = typeof frame.payload === 'string' ? frame.payload : Buffer.from(frame.payload).toString('utf-8');
        if (text !== '2' && text !== '3') {
          log(`🔌 WS → ${text.substring(0, 300)}`);
        }
      } catch {}
    });
  });

  // ---- Navigate ----
  log('Navigating to RunningHub projects page...');
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  log(`Current URL: ${page.url()}`);

  // Take screenshot
  await page.screenshot({ path: join(OUTPUT_DIR, '00-projects-page.png'), fullPage: true });

  // Analyze page structure
  const pageInfo = await page.evaluate(() => {
    const allBtns = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .map(el => ({
        text: (el.textContent || '').trim().substring(0, 80),
        tag: el.tagName,
        href: el.href || '',
      }))
      .filter(b => b.text.length > 0);
    return { buttonCount: allBtns.length, buttons: allBtns.slice(0, 30) };
  });
  log(`Page buttons (${pageInfo.buttonCount} total):`);
  pageInfo.buttons.forEach(b => log(`  [${b.tag}] "${b.text}"`));

  // Auto-save
  setInterval(() => {
    try {
      writeFileSync(API_ALL, JSON.stringify(allRequests, null, 2));
      writeFileSync(SSE_DATA, JSON.stringify(sseEvents, null, 2));
    } catch {}
  }, 10000);

  log('');
  log('========================================');
  log(' Browser is ready. Please:');
  log(' 1. Find the AI dialog / video generation entry');
  log(' 2. Complete a full video generation flow');
  log(' 3. Press Ctrl+C when done');
  log('========================================');
  log('');

  process.on('SIGINT', () => {
    writeFileSync(API_ALL, JSON.stringify(allRequests, null, 2));
    writeFileSync(SSE_DATA, JSON.stringify(sseEvents, null, 2));
    log(`\nSaved: ${allRequests.length} requests, ${sseEvents.length} SSE events`);
    const unique = [...new Set(allRequests.map(r => `${r.method} ${r.url}`))];
    log(`Unique endpoints: ${unique.length}`);
    unique.forEach(u => log(`  ${u}`));
    browser.close().then(() => process.exit(0));
  });
}

main().catch(console.error);

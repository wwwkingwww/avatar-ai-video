'use strict';

const { chromium } = require('playwright');
const { mkdirSync, writeFileSync, appendFileSync } = require('fs');
const { join } = require('path');

const TARGET_URL = process.env.RH_TARGET_URL || 'https://www.runninghub.cn/projects/';
const OUTPUT_DIR = join(__dirname, '..', 'output', 'rh-spy');
const SESSION_DIR = join(__dirname, '..', '.browser-session-rh');

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(SESSION_DIR, { recursive: true });

const LOG_FILE = join(OUTPUT_DIR, 'spy-log.txt');
const API_FILE = join(OUTPUT_DIR, 'api-calls.json');
const RAW_FILE = join(OUTPUT_DIR, 'raw-network.json');
const SSE_FILE = join(OUTPUT_DIR, 'sse-streams.txt');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + '\n');
}

const apiCalls = [];
const rawRequests = [];
const sseMessages = [];
let callId = 0;

async function main() {
  log('========================================');
  log(' RunningHub Dialog Spy - Network Monitor ');
  log('========================================');
  log('');
  log(`Target: ${TARGET_URL}`);
  log(`Output: ${OUTPUT_DIR}`);
  log('');

  const browser = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  log('Browser launched (visible mode - please log in)');

  const page = await browser.newPage();

  // ===== Intercept ALL network requests =====
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    const rt = req.resourceType();

    // Skip static assets
    if (rt === 'image' || rt === 'media' || rt === 'font' || rt === 'stylesheet' ||
        url.includes('.js') || url.includes('.css') || url.includes('.ico') ||
        url.includes('google-analytics') || url.includes('googletagmanager') ||
        url.includes('baidu.com') || url.includes('fxgate.baidu')) {
      return route.continue();
    }

    const entry = {
      id: ++callId,
      timestamp: new Date().toISOString(),
      url,
      method: req.method(),
      resourceType: rt,
      headers: req.headers(),
      postData: null,
    };

    try {
      const pd = req.postData();
      if (pd) {
        try { entry.postData = JSON.parse(pd); } catch { entry.postData = pd.substring(0, 2000); }
      }
    } catch {}

    rawRequests.push(entry);

    if (rt === 'xhr' || rt === 'fetch' || rt === 'eventsource' ||
        url.includes('/api/') || url.includes('/v1/') || url.includes('/v2/') ||
        url.includes('graphql') || url.includes('/openapi/')) {
      apiCalls.push(entry);
    }

    route.continue();
  });

  // ===== Intercept responses =====
  page.on('response', async (resp) => {
    const req = resp.request();
    const url = req.url();
    const rt = req.resourceType();

    if (rt === 'image' || rt === 'media' || rt === 'font' || rt === 'stylesheet' ||
        url.includes('.js') || url.includes('.css') || url.includes('.ico')) return;

    try {
      const ct = resp.headers()['content-type'] || '';
      let body = null;

      if (ct.includes('json')) {
        body = await resp.json().catch(() => null);
      } else if (ct.includes('text/event-stream') || ct.includes('text/plain')) {
        body = await resp.text().catch(() => null);
        if (body && body.length > 5000) body = body.substring(0, 5000) + '...';
      }

      // Find matching request entry
      const entry = rawRequests.find(r => r.url === url && r.method === req.method());
      if (entry) {
        entry.status = resp.status();
        entry.responseHeaders = resp.headers();
        entry.responseBody = body;
        entry.responseCt = ct;
      }

      // Also update apiCalls
      const apiEntry = apiCalls.find(r => r.url === url && r.method === req.method());
      if (apiEntry) {
        apiEntry.status = resp.status();
        apiEntry.responseBody = body;
        apiEntry.responseCt = ct;
      }

      // Log SSE streams
      if (ct.includes('text/event-stream') || url.includes('stream') || url.includes('sse')) {
        const sseLog = { url, status: resp.status(), ct, body: body?.substring(0, 2000) };
        sseMessages.push(sseLog);
        log(`🌊 SSE: ${url} → ${resp.status()} | body: ${body?.substring(0, 300)}`);
      }
    } catch {}
  });

  // ===== Monitor WebSocket =====
  page.on('websocket', (ws) => {
    log(`🔌 WebSocket opened: ${ws.url()}`);
    ws.on('framereceived', (frame) => {
      try {
        const payload = frame.payload;
        const text = typeof payload === 'string' ? payload : Buffer.from(payload).toString('utf-8');
        log(`🔌 WS ← ${text.substring(0, 500)}`);
        sseMessages.push({ type: 'ws-recv', url: ws.url(), data: text.substring(0, 2000) });
      } catch {}
    });
    ws.on('framesent', (frame) => {
      try {
        const payload = frame.payload;
        const text = typeof payload === 'string' ? payload : Buffer.from(payload).toString('utf-8');
        log(`🔌 WS → ${text.substring(0, 500)}`);
        sseMessages.push({ type: 'ws-send', url: ws.url(), data: text.substring(0, 2000) });
      } catch {}
    });
  });

  // ===== Navigate to RunningHub =====
  log('Navigating to RunningHub...');
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  log(`Current URL: ${page.url()}`);

  // ===== Detect login page =====
  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('/signin') || currentUrl.includes('/auth')) {
    log('');
    log('========================================');
    log(' ⚠️  LOGIN REQUIRED');
    log('========================================');
    log(' A browser window has opened. Please:');
    log(' 1. Log in to your RunningHub account');
    log(' 2. Navigate to the projects/dialog page');
    log(' 3. Start an AI video generation conversation');
    log(' 4. Complete the full dialog flow');
    log('');
    log(' The script will capture ALL network activity.');
    log('');
    log(' After login, the script waits on the projects page...');
    log('========================================');
    log('');
  } else {
    log('✅ Already logged in or no auth required');
  }

  // ===== Wait for user to interact with dialog =====
  log('Waiting for user to complete the AI dialog + video generation...');
  log('When done, press Ctrl+C in this terminal to stop capture and save results.');
  log('');

  // Auto-save every 10 seconds
  const saveInterval = setInterval(() => {
    try {
      writeFileSync(API_FILE, JSON.stringify(apiCalls, null, 2));
      writeFileSync(SSE_FILE, JSON.stringify(sseMessages, null, 2));
      writeFileSync(RAW_FILE, JSON.stringify(rawRequests, null, 2));
    } catch {}
  }, 10000);

  // Monitor for dialog patterns
  const dialogMonitor = setInterval(async () => {
    try {
      const dialogData = await page.evaluate(() => {
        // Find dialog/modal elements
        const dialogs = Array.from(document.querySelectorAll(
          '[role="dialog"], [class*="dialog"], [class*="modal"], [class*="chat"], [class*="drawer"]'
        )).map(d => ({
          title: d.querySelector('[class*="title"], [class*="header"], h2, h3')?.textContent?.trim() || '',
          visible: window.getComputedStyle(d).display !== 'none',
          hasInput: !!d.querySelector('input, textarea, [contenteditable]'),
          hasMessages: d.querySelectorAll('[class*="message"], [class*="bubble"], [class*="chat"]').length,
          text: d.textContent?.substring(0, 300) || '',
        })).filter(d => d.visible);

        if (dialogs.length > 0) {
          return dialogs;
        }

        // Fallback: look for any chat-like containers
        const chats = Array.from(document.querySelectorAll(
          '[class*="chat"], [class*="message"], [class*="conversation"]'
        )).map(c => ({
          text: c.textContent?.substring(0, 200) || '',
          elementCount: c.children.length,
        }));

        return chats.length > 0 ? [{ type: 'chat-container', chats }] : null;
      });

      if (dialogData && dialogData.length > 0) {
        const hash = JSON.stringify(dialogData).substring(0, 200);
        if (hash !== global.lastDialogHash) {
          global.lastDialogHash = hash;
          log(`📋 Dialog state changed: ${JSON.stringify(dialogData).substring(0, 400)}`);
        }
      }
    } catch {}
  }, 3000);

  // Keep process alive
  process.on('SIGINT', () => {
    clearInterval(saveInterval);
    clearInterval(dialogMonitor);
    log('');
    log('========================================');
    log(' Shutting down - saving final results...');
    log('========================================');
    saveResults();
    browser.close().then(() => process.exit(0));
  });

  // Also handle terminal close
  process.on('SIGTERM', () => {
    saveResults();
    browser.close().then(() => process.exit(0));
  });
}

function saveResults() {
  writeFileSync(API_FILE, JSON.stringify(apiCalls, null, 2));
  writeFileSync(SSE_FILE, JSON.stringify(sseMessages, null, 2));
  writeFileSync(RAW_FILE, JSON.stringify(rawRequests, null, 2));

  log(`Total API calls captured: ${apiCalls.length}`);
  log(`Total raw requests: ${rawRequests.length}`);
  log(`SSE/WS messages: ${sseMessages.length}`);

  // Print summary of interesting endpoints
  log('');
  log('--- API Endpoint Summary ---');
  const seen = new Set();
  for (const call of apiCalls) {
    const key = `${call.method} ${call.url}`;
    if (!seen.has(key)) {
      seen.add(key);
      log(`  ${call.method} ${call.url} → ${call.status || 'pending'}`);
    }
  }

  log('');
  log(`Results saved to: ${OUTPUT_DIR}/`);
  log('  - api-calls.json (filtered API calls)');
  log('  - raw-network.json (all network requests)');
  log('  - sse-streams.txt (SSE/WebSocket messages)');
  log('  - spy-log.txt (full log)');
}

main().catch(console.error);

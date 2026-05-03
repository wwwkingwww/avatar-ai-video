/**
 * full-check.cjs — 全量 API 健康检查
 *
 * 对 creator-api 执行 8 项结构化检查。
 * 每项检查有明确断言，失败时设置 process.exitCode = 1。
 *
 * 用法：node scripts/full-check.cjs
 *  exit 0 = 全部通过
 *  exit 1 = 至少一项失败
 */
const http = require('http');
const BASE = 'http://localhost:3099';
const TIMEOUT = 15000;

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + path);
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: TIMEOUT
    };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve({ code: res.statusCode, data: JSON.parse(d || '{}') });
        } catch {
          resolve({ code: res.statusCode, raw: d.substring(0, 100) });
        }
      });
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(); reject(new Error('Request timeout')); });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

class CheckResult {
  constructor(name) {
    this.name = name;
    this.ok = false;
    this.detail = '';
  }
  pass(msg) { this.ok = true; this.detail = msg; return this; }
  fail(msg) { this.ok = false; this.detail = msg; return this; }
}

(async () => {
  const results = [];
  let allOk = true;

  // ── 1. Health ─────────────────────────────────
  const hCheck = new CheckResult('HEALTH');
  try {
    const h = await req('GET', '/health');
    if (h.code === 200 && h.data.status === 'ok') {
      const pg = h.data.checks?.postgres || 'unknown';
      const redis = h.data.checks?.redis || 'unknown';
      hCheck.pass(`status=ok pg=${pg} redis=${redis}`);
    } else {
      hCheck.fail(`HTTP ${h.code} status=${h.data.status || '?'}`);
      allOk = false;
    }
  } catch (e) {
    hCheck.fail('Connection failed: ' + e.message);
    allOk = false;
  }
  results.push(hCheck);

  // ── 2. Session ────────────────────────────────
  let sid = null;
  const sCheck = new CheckResult('SESSION');
  try {
    const s = await req('POST', '/api/sessions', {});
    if (s.code === 200 && s.data.sessionId) {
      sid = s.data.sessionId;
      sCheck.pass(`id=${sid} msg=${(s.data.message || '').substring(0, 30)}`);
    } else {
      sCheck.fail(`HTTP ${s.code} sessionId=${s.data.sessionId || 'missing'}`);
      allOk = false;
    }
  } catch (e) {
    sCheck.fail('Failed: ' + e.message);
    allOk = false;
  }
  results.push(sCheck);

  // ── 3-6. Messages ─────────────────────────────
  if (sid) {
    const steps = ['文生视频', '10秒', 'AI帮我写文案', '确认并生成视频'];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const mCheck = new CheckResult(`MSG_${i + 1}`);
      try {
        const r = await req('POST', '/api/sessions/' + sid + '/messages', { content: step, attachments: [] });
        if (r.code === 200) {
          mCheck.pass(`"${step}" -> HTTP 200`);
        } else {
          mCheck.fail(`"${step}" -> HTTP ${r.code}`);
          allOk = false;
        }
      } catch (e) {
        mCheck.fail(`"${step}" failed: ${e.message}`);
        allOk = false;
      }
      results.push(mCheck);
    }
  } else {
    for (let i = 1; i <= 4; i++) {
      results.push(new CheckResult(`MSG_${i}`).fail('Skipped: no session'));
    }
    allOk = false;
  }

  // ── 7. Confirm ────────────────────────────────
  const cCheck = new CheckResult('CONFIRM');
  if (sid) {
    try {
      const c = await req('GET', '/api/sessions/' + sid + '/confirm');
      const phase = c.data.items?.phase || c.data.phase || '?';
      cCheck.pass(`phase=${phase} missing=${JSON.stringify(c.data.missing || 'none')}`);
    } catch (e) {
      cCheck.fail('Failed: ' + e.message);
      allOk = false;
    }
  } else {
    cCheck.fail('Skipped: no session');
    allOk = false;
  }
  results.push(cCheck);

  // ── 8. Tasks ──────────────────────────────────
  const tCheck = new CheckResult('TASKS');
  try {
    const t = await req('GET', '/api/tasks');
    if (t.code === 200 && t.data.data && Array.isArray(t.data.data)) {
      tCheck.pass(`count=${t.data.data.length}`);
    } else {
      tCheck.fail(`HTTP ${t.code} data=${JSON.stringify(t.data).substring(0, 50)}`);
      allOk = false;
    }
  } catch (e) {
    tCheck.fail('Failed: ' + e.message);
    allOk = false;
  }
  results.push(tCheck);

  // ── 9. Capabilities ───────────────────────────
  const capCheck = new CheckResult('CAPABILITIES');
  try {
    const cap = await req('GET', '/api/capabilities');
    if (cap.code === 200) {
      const typesLen = (cap.data.taskTypes || []).length;
      const modelsLen = (cap.data.models || []).length;
      capCheck.pass(`types=${typesLen} models=${modelsLen}`);
    } else {
      capCheck.fail(`HTTP ${cap.code}`);
      allOk = false;
    }
  } catch (e) {
    capCheck.fail('Failed: ' + e.message);
    allOk = false;
  }
  results.push(capCheck);

  // ── 10. Frontend ──────────────────────────────
  const feCheck = new CheckResult('FRONTEND');
  try {
    const fe = await req('GET', '/');
    if (fe.code === 200) {
      feCheck.pass('HTTP 200');
    } else {
      feCheck.fail(`HTTP ${fe.code}`);
      allOk = false;
    }
  } catch (e) {
    feCheck.fail('Failed: ' + e.message);
    allOk = false;
  }
  results.push(feCheck);

  // ── 输出报告 ───────────────────────────────────
  console.log('='.repeat(60));
  console.log('  FULL CHECK REPORT');
  console.log('='.repeat(60));
  for (const r of results) {
    const icon = r.ok ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${r.name}: ${r.detail}`);
  }
  console.log('='.repeat(60));

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`  TOTAL: ${results.length} | PASS: ${passed} | FAIL: ${failed}`);

  if (allOk) {
    console.log('  RESULT: ALL CHECKS PASSED');
    process.exitCode = 0;
  } else {
    console.log('  RESULT: SOME CHECKS FAILED');
    process.exitCode = 1;
  }
})().catch(e => {
  console.error('FATAL:', e.message);
  process.exitCode = 2;
});

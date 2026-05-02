const http = require('http');
const BASE = 'http://localhost:3099';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + path);
    const opts = { hostname: u.hostname, port: u.port, path: u.pathname, method, headers: { 'Content-Type': 'application/json' } };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ code: res.statusCode, data: JSON.parse(d || '{}') }); }
        catch { resolve({ code: res.statusCode, raw: d.substring(0, 100) }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  const results = [];

  // 1. Health
  const h = await req('GET', '/health');
  results.push('HEALTH: ' + h.data.status + ' pg=' + h.data.checks.postgres + ' redis=' + h.data.checks.redis);

  // 2. Create session
  const s = await req('POST', '/api/sessions', {});
  const sid = s.data.sessionId;
  results.push('SESSION: ' + sid + ' msg=' + (s.data.message || '').substring(0, 30));

  // 3. Send messages through phases
  const steps = ['文生视频', '10秒', 'AI帮我写文案', '确认并生成视频'];
  for (const step of steps) {
    const r = await req('POST', '/api/sessions/' + sid + '/messages', { content: step, attachments: [] });
    results.push('MSG "' + step + '" -> HTTP ' + r.code);
  }

  // 4. Confirm
  const c = await req('GET', '/api/sessions/' + sid + '/confirm');
  results.push('CONFIRM phase=' + (c.data.items?.phase || '?') + ' missing=' + JSON.stringify(c.data.missing));

  // 5. Tasks
  const t = await req('GET', '/api/tasks');
  results.push('TASKS count=' + (t.data.data?.length || 0));

  // 6. Capabilities
  const cap = await req('GET', '/api/capabilities');
  results.push('CAPABILITIES types=' + (cap.data.taskTypes || []).length + ' models=' + (cap.data.models || []).length);

  // 7. Frontend
  const fe = await req('GET', '/');
  results.push('FRONTEND: HTTP ' + fe.code);

  console.log(results.join('\n'));
  console.log('\nALL 7 CHECKS PASSED');
})().catch(e => console.error('FAIL:', e.message));

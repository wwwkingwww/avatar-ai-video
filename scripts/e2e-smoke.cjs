const http = require('http');

const BASE = 'http://localhost:3099';
const SID = process.argv[2] || '';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, ...JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data.substring(0, 200) });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Create session
  const s1 = await request('POST', '/api/sessions', {});
  console.log('1. CREATE SESSION:', s1.sessionId, `| round=${s1.round}`);

  const sid = s1.sessionId;

  // Phase 1: INTENT - select task type
  console.log('\n--- Phase 1: INTENT (send "文生视频") ---');
  // Use streaming response
  const done1 = await new Promise((resolve) => {
    const url = new URL(BASE + `/api/sessions/${sid}/messages`);
    const req = http.request({
      hostname: url.hostname, port: url.port, path: url.pathname,
      method: 'POST', headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        const lines = d.split('\n').filter((l) => l.startsWith('data: '));
        for (const l of lines) {
          try {
            const p = JSON.parse(l.slice(6));
            if (p.type === 'done') resolve(p);
          } catch {}
        }
      });
    });
    req.write(JSON.stringify({ content: '文生视频', attachments: [] }));
    req.end();
  });

  console.log('  done.context.phase:', done1.context?.phase);
  console.log('  done.context.intent:', JSON.stringify(done1.context?.intent));

  // Phase 2: PARAMS - send duration
  console.log('\n--- Phase 2: PARAMS (send "15秒") ---');
  const done2 = await new Promise((resolve) => {
    const url = new URL(BASE + `/api/sessions/${sid}/messages`);
    const req = http.request({
      hostname: url.hostname, port: url.port, path: url.pathname,
      method: 'POST', headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        const lines = d.split('\n').filter((l) => l.startsWith('data: '));
        for (const l of lines) {
          try {
            const p = JSON.parse(l.slice(6));
            if (p.type === 'done') resolve(p);
          } catch {}
        }
      });
    });
    req.write(JSON.stringify({ content: '15秒', attachments: [] }));
    req.end();
  });

  console.log('  done.context.phase:', done2.context?.phase);
  console.log('  done.context.intent:', JSON.stringify(done2.context?.intent));

  // Check confirm endpoint
  console.log('\n--- Check /confirm ---');
  const conf = await request('GET', `/api/sessions/${sid}/confirm`);
  console.log('  confirm.items:', JSON.stringify(conf.items, null, 2));
  console.log('  confirm.missing:', JSON.stringify(conf.missing));

  // Test submit (V2 path)
  console.log('\n--- Submit task ---');
  const sub = await request('POST', `/api/sessions/${sid}/submit`, {});
  console.log('  submit:', JSON.stringify(sub));
}

main().catch(console.error);

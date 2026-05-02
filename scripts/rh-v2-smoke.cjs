const KEY = process.env.RH_API_KEY;
const BASE = process.env.RH_API_BASE_URL || 'https://www.runninghub.cn/openapi/v2';

async function test() {
  console.log('=== Step 1: Upload ===');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

  const boundary = '----rh-test';
  const head = Buffer.from(
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="file"; filename="t.png"\r\n' +
    'Content-Type: image/png\r\n\r\n'
  );
  const tail = Buffer.from('\r\n--' + boundary + '--\r\n');
  const body = Buffer.concat([head, png, tail]);

  const r1 = await fetch(BASE + '/media/upload/binary', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + KEY,
      'Content-Type': 'multipart/form-data; boundary=' + boundary
    },
    body
  });
  const d1 = await r1.json();
  console.log('upload status:', r1.status, 'code:', d1.code);
  console.log('download_url:', (d1.data?.download_url || '').substring(0, 80));

  if (d1.code !== 0) { console.log('UPLOAD FAILED'); return; }

  console.log('\n=== Step 2: Submit text-to-video ===');
  const r2 = await fetch(BASE + '/rhart-video-v3.1-fast/text-to-video', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: 'A calm spring afternoon, cherry blossoms falling beside a country road.',
      aspectRatio: '16:9',
      duration: '8',
      resolution: '720p'
    })
  });
  const d2 = await r2.json();
  console.log('submit status:', r2.status);
  console.log('taskId:', d2.taskId, 'errorCode:', d2.errorCode, 'errorMessage:', d2.errorMessage);

  if (!d2.taskId) { console.log('SUBMIT FAILED:', JSON.stringify(d2).substring(0, 300)); return; }

  console.log('\n=== Step 3: Poll ===');
  const deadline = Date.now() + 180000;
  let attempts = 0;
  while (Date.now() < deadline && attempts < 30) {
    await new Promise(r => setTimeout(r, 5000));
    attempts++;
    const r3 = await fetch(BASE + '/query', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ taskId: d2.taskId })
    });
    const d3 = await r3.json();
    console.log('poll #' + attempts + ':', d3.status);
    if (d3.status === 'SUCCESS') {
      console.log('DONE! results:', JSON.stringify(d3.results).substring(0, 500));
      return;
    }
    if (d3.status === 'FAILED' || d3.status === 'CANCEL') {
      console.log('ended:', d3.status, 'reason:', d3.failedReason || d3.message);
      return;
    }
  }
  console.log('timeout after', attempts, 'polls');
}
test().catch(e => console.error('FATAL:', e.message));

const mqtt = require('mqtt');
const { execSync } = require('child_process');

const BROKER_URL = process.env.MQTT_BROKER || 'mqtt://127.0.0.1:1883';
const PHONE_ID = process.env.PHONE_ID || 'phone_01';
const BRIDGE_ID = PHONE_ID + '_bridge';
const PHONE_IP = process.env.PHONE_IP || '100.105.213.115:5555';
const PLATFORMS = (process.env.PLATFORMS || 'douyin,kuaishou,xiaohongshu').split(',');
const ADB_PREFIX = `adb -s ${PHONE_IP}`;

const debugLog = (...args) => { if (process.env.DEBUG) console.log(...args); }; // eslint-disable-line no-console

let _connected = false;

function adb(cmd) {
  try {
    return execSync(`${ADB_PREFIX} ${cmd} 2>nul`, { encoding: 'utf8', timeout: 15000 }).trim();
  } catch (e) { return null; }
}

function getDeviceInfo() {
  const r = adb('shell dumpsys battery 2>/dev/null');
  let battery = 100;
  if (r) {
    const m = r.match(/level:\s*(\d+)/);
    if (m) battery = parseInt(m[1]);
  }
  return { model: 'evergo-bridge', sdk: 0, battery, adb: true };
}

function ensureConnected() {
  if (_connected) return true;
  try {
    const r = adb('shell echo OK');
    if (r && r.includes('OK')) { _connected = true; return true; }
    adb('connect ' + PHONE_IP.replace(':5555', ''));
    const r2 = adb('shell echo OK');
    if (r2 && r2.includes('OK')) { _connected = true; return true; }
  } catch {
    adb('connect ' + PHONE_IP.replace(':5555', ''));
    try { adb('shell echo OK'); _connected = true; return true; } catch { /* ignore */ }
  }
  return false;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function executeActions(actions, _params) {
  const screenshots = [];
  for (const a of actions) {
    switch (a.type) {
      case 'launch':
        adb(`shell monkey -p ${a.package} -c android.intent.category.LAUNCHER 1`);
        break;
      case 'tap':
        adb(`shell input tap ${a.x} ${a.y}`);
        break;
      case 'swipe':
        adb(`shell input swipe ${a.x1} ${a.y1} ${a.x2} ${a.y2} ${a.duration || 300}`);
        break;
      case 'wait':
        await sleep(a.ms || 1000);
        break;
      case 'input_text': {
        const text = (a.content || a.text || '').replace(/"/g, '\\"').replace(/ /g, '%s');
        if (a.x && a.y) { adb(`shell input tap ${a.x} ${a.y}`); await sleep(300); }
        adb(`shell input text "${text}"`);
        break;
      }
      case 'screenshot': {
        const name = a.name || 'shot_' + Date.now();
        adb(`shell screencap -p /sdcard/${name}.png`);
        screenshots.push({ name, path: `/sdcard/${name}.png` });
        break;
      }
      case 'back':
        adb('shell input keyevent 4');
        await sleep(300);
        break;
      case 'home':
        adb('shell input keyevent 3');
        await sleep(300);
        break;
    }
    await sleep(100);
  }
  return { success: true, screenshots };
}

const client = mqtt.connect(BROKER_URL, {
  clientId: `bridge-${PHONE_ID}`,
  clean: true,
  reconnectPeriod: 1000,
  connectTimeout: 30000,
});

client.on('connect', () => {
  debugLog(`[bridge] MQTT connected as ${BRIDGE_ID}`);

  client.subscribe(`phone/${BRIDGE_ID}/task`, { qos: 1 });
  client.subscribe(`phone/${BRIDGE_ID}/cmd`, { qos: 1 });

  const info = getDeviceInfo();
  const basePayload = {
    phone_id: PHONE_ID, bridge_id: BRIDGE_ID, platforms: PLATFORMS,
    source: 'bridge', ...info,
  };
  client.publish(`phone/${BRIDGE_ID}/status`, JSON.stringify({
    ...basePayload, status: 'online', timestamp: Date.now(),
  }), { retain: true });
  client.publish(`phone/${BRIDGE_ID}/heartbeat`, JSON.stringify({
    ...basePayload, timestamp: Date.now(),
  }), { retain: true });

  setInterval(() => {
    ensureConnected();
    const i = getDeviceInfo();
    client.publish(`phone/${BRIDGE_ID}/heartbeat`, JSON.stringify({
      phone_id: PHONE_ID, bridge_id: BRIDGE_ID, platforms: PLATFORMS,
      source: 'bridge', ...i, timestamp: Date.now(),
    }), { retain: true });
  }, 10000);
});

client.on('message', async (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    if (topic === `phone/${BRIDGE_ID}/task`) {
      await handleTask(data);
    } else if (topic === `phone/${BRIDGE_ID}/cmd`) {
      await handleCommand(data);
    }
  } catch (e) {
    console.error('[bridge] message error:', e.message);
  }
});

async function handleTask(task) {
  debugLog(`[bridge] TASK ${task.task_id} | ${task.platform}`);
  publishStatus(task.task_id, 'publishing', { step: 'exec' });

  try {
    ensureConnected();
    const result = await executeActions(task.actions, task.params || {});
    publishStatus(task.task_id, 'success', { step: 'done', screenshots: result.screenshots });
    debugLog(`[bridge] TASK ${task.task_id} done`);
  } catch (e) {
    publishStatus(task.task_id, 'failed', { error: e.message });
    console.error(`[bridge] TASK ${task.task_id} failed:`, e.message);
  }
}

let currentTaskId = null
let paused = false

async function handleCommand(cmd) {
  debugLog('[bridge] CMD', cmd.type)
  switch (cmd.type) {
    case 'restart':
      setTimeout(() => process.exit(0), 500)
      break
    case 'stop':
      if (currentTaskId) {
        publishStatus(currentTaskId, 'failed', { error: '用户取消' })
        currentTaskId = null
        debugLog('[bridge] task stopped by user')
      }
      break
    case 'pause':
      paused = true
      debugLog('[bridge] bridge paused')
      break
    case 'resume':
      paused = false
      debugLog('[bridge] bridge resumed')
      break
    case 'status':
      client.publish(`phone/${BRIDGE_ID}/status`, JSON.stringify({
        type: 'cmd_result', status: paused ? 'paused' : 'online',
        currentTask: currentTaskId, timestamp: Date.now(),
      }))
      break
    case 'exec':
      try {
        const out = execSync(cmd.command, { encoding: 'utf8', timeout: 15000 }).trim()
        client.publish(`phone/${BRIDGE_ID}/status`, JSON.stringify({
          type: 'exec_result', command: cmd.command, output: out, success: true, timestamp: Date.now(),
        }))
      } catch (e) {
        client.publish(`phone/${BRIDGE_ID}/status`, JSON.stringify({
          type: 'exec_result', command: cmd.command, error: e.message, success: false, timestamp: Date.now(),
        }))
      }
      break
  }
}

function publishStatus(taskId, status, extra = {}) {
  client.publish(`phone/${BRIDGE_ID}/status`, JSON.stringify({
    task_id: taskId, phone_id: PHONE_ID, status,
    platforms: PLATFORMS, ...extra, timestamp: Date.now(),
  }));
}

client.on('error', e => console.error('[bridge] MQTT error:', e.message));

process.on('SIGINT', () => { client.end(); process.exit(0); });

debugLog('[bridge] Server ADB Bridge started');

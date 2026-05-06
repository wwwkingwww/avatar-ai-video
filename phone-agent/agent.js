import mqtt from 'mqtt';
import { TOPICS, TASK_STATUS, validateTaskPayload } from '../shared/mqtt-protocol.js';
import { executeActions } from './action-engine.js';
import { downloadVideo } from './file-downloader.js';
import { getDeviceInfo } from './adb-bridge.js';

const debugLog = (...args) => { if (process.env.DEBUG) process.stderr.write(args.map(String).join(' ') + '\n') };

const BROKER_URL = process.env.MQTT_BROKER || 'mqtt://127.0.0.1:1883';
const PHONE_ID = process.env.PHONE_ID || 'phone_01';
const PLATFORM = process.env.PLATFORM || 'douyin';

const client = mqtt.connect(BROKER_URL, {
  clientId: `agent-${PHONE_ID}`,
  clean: true,
  reconnectPeriod: 1000,
  connectTimeout: 30000,
});

client.on('connect', () => {
  debugLog(`[MQTT] connected to ${BROKER_URL} as ${PHONE_ID}`);

  client.subscribe(TOPICS.TASK(PHONE_ID), { qos: 1 });
  client.subscribe(TOPICS.CMD(PHONE_ID), { qos: 1 });

  const deviceInfo = getDeviceInfo();
  client.publish(TOPICS.STATUS(PHONE_ID), JSON.stringify({
    phone_id: PHONE_ID,
    platform: PLATFORM,
    status: 'online',
    ...deviceInfo,
    timestamp: Date.now(),
  }));

  setInterval(() => {
    const info = getDeviceInfo();
    client.publish(TOPICS.HEARTBEAT(PHONE_ID), JSON.stringify({
      phone_id: PHONE_ID,
      ...info,
      timestamp: Date.now(),
    }));
  }, 30000);
});

client.on('message', async (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());

    if (topic === TOPICS.TASK(PHONE_ID)) {
      await handleTask(data);
    } else if (topic === TOPICS.CMD(PHONE_ID)) {
      await handleCommand(data);
    }
  } catch (e) {
    console.error('消息处理失败:', e.message);
  }
});

async function handleTask(task) {
  const validation = validateTaskPayload(task);
  if (!validation.valid) {
    publishStatus(task.task_id, TASK_STATUS.FAILED, { error: validation.error });
    return;
  }

  debugLog(`[TASK] ${task.task_id} - ${task.platform}`);

  publishStatus(task.task_id, TASK_STATUS.DOWNLOADING, { step: 'download' });
  try {
    const videoPath = await downloadVideo(task.video.url, task.task_id);
    const params = { ...task.params || {}, video_path: videoPath, ...task.metadata };

    publishStatus(task.task_id, TASK_STATUS.PUBLISHING, { step: 'publish' });
    const result = await executeActions(task.actions, params);

    publishStatus(task.task_id, TASK_STATUS.SUCCESS, {
      step: 'done',
      screenshots: result.screenshots,
    });
    debugLog(`[TASK] ${task.task_id} - 发布成功`);
  } catch (e) {
    publishStatus(task.task_id, TASK_STATUS.FAILED, {
      step: 'error',
      error: e.message,
    });
    console.error(`[TASK] ${task.task_id} - 失败: ${e.message}`);
  }
}

let currentTaskId = null
let paused = false

async function handleCommand(cmd) {
  debugLog(`[CMD] ${cmd.type}`)
  switch (cmd.type) {
    case 'restart':
      process.exit(0)
    case 'stop':
      if (currentTaskId) {
        publishStatus(currentTaskId, TASK_STATUS.FAILED, { error: '用户取消' })
        currentTaskId = null
        debugLog('[CMD] task stopped by user')
      }
      break
    case 'pause':
      paused = true
      debugLog('[CMD] agent paused')
      client.publish(TOPICS.STATUS(PHONE_ID), JSON.stringify({
        phone_id: PHONE_ID, status: 'paused', timestamp: Date.now(),
      }))
      break
    case 'resume':
      paused = false
      debugLog('[CMD] agent resumed')
      client.publish(TOPICS.STATUS(PHONE_ID), JSON.stringify({
        phone_id: PHONE_ID, status: 'online', timestamp: Date.now(),
      }))
      break
    case 'status':
      client.publish(TOPICS.STATUS(PHONE_ID), JSON.stringify({
        phone_id: PHONE_ID, status: paused ? 'paused' : 'online',
        currentTask: currentTaskId, timestamp: Date.now(),
      }))
      break
  }
}

function publishStatus(taskId, status, extra = {}) {
  client.publish(TOPICS.STATUS(PHONE_ID), JSON.stringify({
    task_id: taskId,
    phone_id: PHONE_ID,
    status,
    platform: PLATFORM,
    ...extra,
    timestamp: Date.now(),
  }));
}

process.on('SIGINT', () => {
  client.end();
  process.exit(0);
});

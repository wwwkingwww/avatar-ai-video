import mqtt from 'mqtt';

const debugLog = (...args) => { if (process.env.DEBUG) console.log(...args); }; // eslint-disable-line no-console

const BROKER_URL = process.env.MQTT_BROKER || 'mqtt://mosquitto:1883';
const TASK_TIMEOUT = 5 * 60 * 1000;
const PLATFORMS = ['douyin', 'kuaishou', 'xiaohongshu'];

function taskTopic(phoneId) {
  return `phone/${phoneId}/task`;
}

function statusTopic(phoneId) {
  return `phone/${phoneId}/status`;
}

export async function dispatchTask(session) {
  const platforms = session.context?.platforms || [session.context?.platform || 'douyin'];
  const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const videoUrl = session.context?.videoUrl || 'https://minio.local/avatar-videos/placeholder.mp4';
  const caption = session.context?.caption || session.context?.text || 'AI 生成视频';

  const results = [];

  for (const platform of platforms) {
    if (!PLATFORMS.includes(platform)) {
      debugLog(`[TaskDispatcher] 跳过不支持的平台: ${platform}`);
      continue;
    }

    const phoneId = await findPhoneForPlatform(platform);
    if (!phoneId) {
      debugLog(`[TaskDispatcher] ${platform}: 没有在线的手机`);
      results.push({ platform, success: false, error: '没有在线的手机' });
      continue;
    }

    try {
      const result = await publishAndWait(phoneId, {
        task_id: taskId,
        platform,
        priority: 'normal',
        video: { url: videoUrl },
        metadata: {
          caption,
          sessionId: session.id,
          style: session.context?.style || 'default',
        },
        actions: [
          { type: 'launch', package: getPlatformPackage(platform) },
          { type: 'wait', ms: 3000 },
          { type: 'tap', x: 540, y: 200 },
          { type: 'input_text', text: caption },
          { type: 'wait', ms: 1000 },
          { type: 'tap', x: 540, y: 1800 },
          { type: 'wait', ms: 15000 },
          { type: 'screenshot' },
        ],
      });

      results.push({ platform, success: true, phoneId, ...result });
    } catch (e) {
      console.error(`[TaskDispatcher] ${platform} 分发失败:`, e.message);
      results.push({ platform, success: false, error: e.message });
    }
  }

  return { taskId, results };
}

function getPlatformPackage(platform) {
  const pkgs = {
    douyin: 'com.ss.android.ugc.aweme',
    kuaishou: 'com.kuaishou.nebula',
    xiaohongshu: 'com.xingin.xhs',
  };
  return pkgs[platform] || '';
}

async function findPhoneForPlatform(platform) {
  return new Promise((resolve) => {
    const client = mqtt.connect(BROKER_URL, { clean: true, connectTimeout: 5000 });
    const phones = [];

    client.on('connect', () => {
      client.subscribe('phone/+/heartbeat', { qos: 0 });
    });

    client.on('message', (topic, payload) => {
      try {
        const match = topic.match(/^phone\/(.+)\/heartbeat$/);
        if (!match) return;
        const phoneId = match[1];
        const data = JSON.parse(payload.toString());
        if (!phones.includes(phoneId)) {
          phones.push(phoneId);
        }
        if (data.platforms && data.platforms.includes(platform)) {
          client.end();
          resolve(phoneId);
        }
      } catch { /* skip malformed payload */ }
    });

    setTimeout(() => {
      client.end();
      resolve(phones.length > 0 ? phones[0] : null);
    }, 3000);
  });
}

function publishAndWait(phoneId, taskPayload) {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, { clean: true });
    const timeout = setTimeout(() => {
      client.end();
      reject(new Error(`任务 ${taskPayload.task_id} 超时`));
    }, TASK_TIMEOUT);

    client.on('connect', () => {
      client.subscribe(statusTopic(phoneId), { qos: 1 });
      client.publish(taskTopic(phoneId), JSON.stringify(taskPayload), { qos: 1 }, (err) => {
        if (err) {
          clearTimeout(timeout);
          client.end();
          reject(err);
        }
      });
    });

    client.on('message', (topic, payload) => {
      if (topic !== statusTopic(phoneId)) return;
      const status = JSON.parse(payload.toString());
      if (status.task_id !== taskPayload.task_id) return;

      if (status.status === 'success') {
        clearTimeout(timeout);
        client.end();
        resolve({ screenshots: status.screenshots || [] });
      } else if (status.status === 'failed') {
        clearTimeout(timeout);
        client.end();
        reject(new Error(status.error || '发布失败'));
      }
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      client.end();
      reject(err);
    });
  });
}

import mqtt from 'mqtt';
import { TOPICS, TASK_STATUS, PLATFORMS } from '../../shared/mqtt-protocol.js';
import { getAvailablePhone, isPhoneOnline } from './device-registry.js';

const BROKER_URL = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const TASK_TIMEOUT = 5 * 60 * 1000;

export async function dispatchToPhone(task) {
  const { platform, video, metadata } = task;

  if (!PLATFORMS.includes(platform)) {
    throw new Error(`不支持的平台: ${platform}`);
  }

  const phone = await getAvailablePhone(platform);
  if (!phone) {
    throw new Error(`没有在线的 ${platform} 手机`);
  }

  console.log(`[Dispatch] 分配到手机: ${phone.phoneId} (${platform})`);

  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, { clean: true });
    const timeout = setTimeout(() => {
      client.end();
      reject(new Error(`任务 ${task.task_id} 超时 (${TASK_TIMEOUT / 1000}s)`));
    }, TASK_TIMEOUT);

    client.on('connect', () => {
      client.subscribe(TOPICS.STATUS(phone.phoneId), { qos: 1 });

      client.publish(TOPICS.TASK(phone.phoneId), JSON.stringify({
        task_id: task.task_id,
        platform,
        priority: task.priority || 'normal',
        video,
        metadata,
        actions: task.actions,
        params: task.params || {},
      }), { qos: 1 }, (err) => {
        if (err) {
          clearTimeout(timeout);
          client.end();
          reject(err);
        }
      });
    });

    client.on('message', (topic, payload) => {
      if (topic !== TOPICS.STATUS(phone.phoneId)) return;

      const status = JSON.parse(payload.toString());
      if (status.task_id !== task.task_id) return;

      console.log(`[Dispatch] ${status.task_id}: ${status.status} (${status.step || ''})`);

      if (status.status === TASK_STATUS.SUCCESS) {
        clearTimeout(timeout);
        client.end();
        resolve({
          success: true,
          phoneId: phone.phoneId,
          screenshots: status.screenshots || [],
        });
      } else if (status.status === TASK_STATUS.FAILED) {
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

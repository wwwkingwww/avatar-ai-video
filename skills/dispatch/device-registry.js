import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const DEVICE_KEY = 'phones';
const HEARTBEAT_TTL = 90;

export async function registerHeartbeat(phoneId, info) {
  await redis.hset(`${DEVICE_KEY}:${phoneId}`, {
    ...info,
    last_seen: Date.now(),
  });
  await redis.expire(`${DEVICE_KEY}:${phoneId}`, HEARTBEAT_TTL);
}

export async function getAvailablePhone(platform) {
  const keys = await redis.keys(`${DEVICE_KEY}:*`);

  for (const key of keys) {
    const phoneId = key.split(':')[1];
    const info = await redis.hgetall(key);

    if (info.platform === platform && info.status === 'online') {
      return { phoneId, ...info };
    }
  }

  return null;
}

export async function getAllPhones() {
  const keys = await redis.keys(`${DEVICE_KEY}:*`);
  const phones = [];

  for (const key of keys) {
    const info = await redis.hgetall(key);
    if (info.phone_id) {
      phones.push(info);
    }
  }

  return phones;
}

export async function isPhoneOnline(phoneId) {
  return await redis.exists(`${DEVICE_KEY}:${phoneId}`);
}

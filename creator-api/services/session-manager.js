import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const SESSION_TTL = 86400;

function sessionKey(id) {
  return `session:${id}`;
}

export async function createSession() {
  const id = uuidv4();
  const now = Date.now().toString();
  await redis.hset(sessionKey(id), {
    round: '0',
    status: 'chatting',
    history: '[]',
    context: '{}',
    files: '[]',
    createdAt: now,
  });
  await redis.expire(sessionKey(id), SESSION_TTL);
  return id;
}

export async function getSession(id) {
  const data = await redis.hgetall(sessionKey(id));
  if (!data || Object.keys(data).length === 0) return null;
  return {
    id,
    round: parseInt(data.round, 10),
    status: data.status,
    history: JSON.parse(data.history || '[]'),
    context: JSON.parse(data.context || '{}'),
    files: JSON.parse(data.files || '[]'),
    createdAt: data.createdAt,
  };
}

export async function updateSession(id, updates) {
  const fields = {};
  if (updates.round !== undefined) fields.round = String(updates.round);
  if (updates.status !== undefined) fields.status = updates.status;
  if (updates.history !== undefined) fields.history = JSON.stringify(updates.history);
  if (updates.context !== undefined) fields.context = JSON.stringify(updates.context);
  if (updates.files !== undefined) fields.files = JSON.stringify(updates.files);
  if (updates.taskId !== undefined) fields.taskId = updates.taskId;
  if (Object.keys(fields).length > 0) {
    await redis.hset(sessionKey(id), fields);
    await redis.expire(sessionKey(id), SESSION_TTL);
  }
}

export async function incrementRound(session) {
  const newRound = session.round + 1;
  await updateSession(session.id, { round: newRound });
  return { round: newRound };
}

export async function deleteSession(id) {
  await redis.del(sessionKey(id));
}

export async function listSessions(limit = 20) {
  const keys = [];
  let cursor = '0';
  do {
    const result = await redis.scan(cursor, 'MATCH', 'session:*', 'COUNT', limit);
    cursor = result[0];
    keys.push(...result[1]);
  } while (cursor !== '0' && keys.length < limit);

  const sessions = [];
  for (const key of keys.slice(0, limit)) {
    const id = key.replace('session:', '');
    const s = await getSession(id);
    if (s) {
      sessions.push({
        id: s.id,
        round: s.round,
        status: s.status,
        phase: s.context?.phase || 'INTENT',
        taskType: s.context?.intent?.taskType || null,
        createdAt: s.createdAt,
      });
    }
  }
  return sessions;
}

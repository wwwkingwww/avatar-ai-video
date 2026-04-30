import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const SESSION_TTL = 86400;
const MAX_ROUNDS = 4;

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
    forceConfirm: '0',
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
    forceConfirm: data.forceConfirm === '1',
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
  if (updates.forceConfirm !== undefined) fields.forceConfirm = updates.forceConfirm ? '1' : '0';
  if (updates.taskId !== undefined) fields.taskId = updates.taskId;
  if (Object.keys(fields).length > 0) {
    await redis.hset(sessionKey(id), fields);
    await redis.expire(sessionKey(id), SESSION_TTL);
  }
}

export async function incrementRound(session) {
  const newRound = session.round + 1;
  const forceConfirm = newRound >= MAX_ROUNDS;
  await updateSession(session.id, { round: newRound, forceConfirm });
  return { round: newRound, forceConfirm };
}

export { MAX_ROUNDS };

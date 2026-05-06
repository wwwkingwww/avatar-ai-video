import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sessionsRouter } from './routes/sessions.js';
import { messagesRouter } from './routes/messages.js';
import { uploadRouter } from './routes/upload.js';
import { submitRouter } from './routes/submit.js';
import { capabilitiesRouter, setModelRouter } from './routes/capabilities.js';
import { tasksRouter } from './routes/tasks.js';
import { adminRouter } from './routes/admin.js';
import { initAdminAuth } from './middleware/admin-auth.js';
import { ModelRouter } from '../skills/runninghub/model-router.js';
import { SmartModelRouter } from './services/smart-model-router.js';
import { setSmartRouter } from './services/ai-proxy.js';
import { logger } from './services/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3099;

app.use(cors({
  origin: true,
  credentials: true,
}));

function checkRequiredConfig() {
  const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY;
  const issues = [];

  if (!DEEPSEEK_KEY) {
    issues.push('❌ DEEPSEEK_KEY 未设置。AI 对话功能将不可用。请在 creator-api/.env 中设置 DEEPSEEK_KEY=your-deepseek-key');
  } else if (DEEPSEEK_KEY === 'your-deepseek-api-key-here' || DEEPSEEK_KEY.length < 10) {
    issues.push('⚠️ DEEPSEEK_KEY 看起来是占位符。请在 creator-api/.env 中设置为真实的 API Key');
  }

  if (issues.length > 0) {
    logger.warn('\n========== 配置检查警告 ==========');
    issues.forEach(i => logger.warn(i));
    logger.warn('==================================\n');
  }

  return issues.length === 0;
}

checkRequiredConfig();
initAdminAuth();

app.use(express.json());

async function setupModelRouter() {
  let prisma = null;
  try {
    const prismaModule = await import('./prisma/client.js');
    prisma = prismaModule.default;
  } catch (e) {
    logger.debug('[server] prisma not available:', e.message)
  }

  const dbLoader = prisma
    ? async () => {
        const models = await prisma.modelRegistry.findMany({
          where: { visible: true, status: 'published' },
        });
        return models;
      }
    : null;

  const modelRouter = new ModelRouter(undefined, undefined, dbLoader);
  await modelRouter.init();
  setModelRouter(modelRouter);

  try {
    const smartRouter = new SmartModelRouter(undefined, undefined, dbLoader);
    await smartRouter.init();
    setSmartRouter(smartRouter);
    logger.debug(`[server] SmartModelRouter initialized with ${smartRouter.models?.length || 0} models`);
  } catch (e) {
    logger.warn(`[server] SmartModelRouter init failed: ${e.message}`);
  }

  return modelRouter;
}

app.get('/health', async (_req, res) => {
  try {
    const Redis = (await import('ioredis')).default;
    const probe = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await probe.connect();
    await probe.ping();
    probe.disconnect();

    const mqttModule = await import('mqtt');
    const mqttOk = await new Promise((resolve) => {
      const c = mqttModule.default.connect(process.env.MQTT_BROKER || 'mqtt://localhost:1883', {
        connectTimeout: 3000,
        clean: true,
      });
      c.on('connect', () => { c.end(); resolve(true); });
      c.on('error', () => { c.end(); resolve(false); });
      setTimeout(() => { c.end(); resolve(false); }, 2500);
    });

    let pgOk = false;
    try {
      const prisma = (await import('./prisma/client.js')).default;
      await prisma.$queryRaw`SELECT 1`;
      pgOk = true;
    } catch { logger.debug('[server] prisma connection unavailable') }

    res.json({
      status: 'ok',
      uptime: process.uptime(),
      checks: { redis: true, mqtt: mqttOk, postgres: pgOk },
    });
  } catch {
    res.status(503).json({ status: 'degraded', uptime: process.uptime() });
  }
});

app.use('/api/sessions', sessionsRouter);
app.use('/api/sessions', messagesRouter);
app.use('/api/sessions', uploadRouter);
app.use('/api/sessions', submitRouter);
app.use('/api/capabilities', capabilitiesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/admin', adminRouter);

const frontendDist = join(__dirname, '..', 'creator-frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (_req, res) => {
  res.sendFile(join(frontendDist, 'index.html'));
});

async function start() {
  await setupModelRouter();
  logger.debug('[server] ModelRouter initialized with DB loader');

  try {
    await import('./workers/generation-worker.js');
    logger.debug('[server] Generation worker started');
  } catch (e) {
    logger.warn(`[server] Generation worker failed to start: ${e.message}`);
  }

  app.listen(PORT, () => {
    logger.debug(`[creator-api] running on http://0.0.0.0:${PORT}`);
  });
}

start();

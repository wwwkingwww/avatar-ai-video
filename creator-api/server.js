import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sessionsRouter } from './routes/sessions.js';
import { messagesRouter } from './routes/messages.js';
import { uploadRouter } from './routes/upload.js';
import { submitRouter } from './routes/submit.js';
import { capabilitiesRouter } from './routes/capabilities.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const app = express();
const PORT = process.env.PORT || 3099;

app.use(express.json());

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
    } catch {}

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

app.use('/phone-files', express.static(join(__dirname, 'phone-agent')));
app.use('/phone-files/shared', express.static(join(__dirname, 'shared')));

const frontendDist = join(__dirname, '..', 'creator-frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (_req, res) => {
  res.sendFile(join(frontendDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[creator-api] running on http://0.0.0.0:${PORT}`);
});

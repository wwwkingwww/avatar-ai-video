import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sessionsRouter } from './routes/sessions.js';
import { messagesRouter } from './routes/messages.js';
import { uploadRouter } from './routes/upload.js';
import { submitRouter } from './routes/submit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3099;

app.use(express.json());

app.use('/api/sessions', sessionsRouter);
app.use('/api/sessions', messagesRouter);
app.use('/api/sessions', uploadRouter);
app.use('/api/sessions', submitRouter);

const frontendDist = join(__dirname, '..', 'creator-frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (_req, res) => {
  res.sendFile(join(frontendDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[creator-api] running on http://0.0.0.0:${PORT}`);
});

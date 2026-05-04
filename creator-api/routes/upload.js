import { Router } from 'express';
import multer from 'multer';
import { withSession } from '../middleware/round-guard.js';
import { uploadFile } from '../services/minio-uploader.js';
import { updateSession } from '../services/session-manager.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
export const uploadRouter = Router();

uploadRouter.post('/:id/upload', withSession(), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: '未提供文件' });
    const result = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    const session = req.session;
    const files = session.files || [];
    files.push(result);
    const ctx = session.context || {};
    if (!ctx.intent) ctx.intent = {};
    const mime = (req.file.mimetype || '').toLowerCase();
    const name = (req.file.originalname || '').toLowerCase();
    if (mime.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp')) {
      ctx.intent.hasImage = true;
    }
    if (mime.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.avi') || name.endsWith('.webm')) {
      ctx.intent.hasVideo = true;
    }
    await updateSession(session.id, { files, context: ctx });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

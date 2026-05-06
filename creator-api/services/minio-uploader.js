import { Client as MinioClient } from 'minio';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.js'

const BUCKET = process.env.MINIO_BUCKET || 'creator-uploads';

const rawEndpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
const url = new URL(rawEndpoint);

const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;

if (!MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
  throw new Error('MINIO_ACCESS_KEY and MINIO_SECRET_KEY must be set in environment');
}

const minio = new MinioClient({
  endPoint: url.hostname,
  port: parseInt(url.port || '9000', 10),
  useSSL: url.protocol === 'https:',
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

export async function ensureBucket() {
  const exists = await minio.bucketExists(BUCKET);
  if (!exists) {
    await minio.makeBucket(BUCKET);
  }
}

export async function uploadFile(fileBuffer, originalName, mimeType) {
  await ensureBucket();
  const ext = extname(originalName) || '.bin';
  const objectName = `uploads/${uuidv4()}${ext}`;
  await minio.putObject(BUCKET, objectName, fileBuffer, fileBuffer.length, {
    'Content-Type': mimeType,
  });
  const url = await minio.presignedGetObject(BUCKET, objectName, 24 * 60 * 60);
  return { url, name: originalName, objectName, size: fileBuffer.length };
}

export async function uploadFromUrl(sourceUrl, prefix = 'videos') {
  await ensureBucket();

  const ext = extname(new URL(sourceUrl).pathname) || '.mp4';
  const objectName = `${prefix}/${uuidv4()}${ext}`;

  const res = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  if (!res.ok) {
    throw new Error(`下载视频失败 HTTP ${res.status}: ${sourceUrl.substring(0, 100)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'video/mp4';

  await minio.putObject(BUCKET, objectName, buffer, buffer.length, {
    'Content-Type': contentType,
  });

  const url = await minio.presignedGetObject(BUCKET, objectName, 7 * 24 * 60 * 60);

  logger.debug(`[minio] uploaded video: ${objectName} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);

  return { url, objectName, size: buffer.length };
}

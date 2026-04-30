import { Client as MinioClient } from 'minio';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

const BUCKET = process.env.MINIO_BUCKET || 'creator-uploads';

const rawEndpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
const url = new URL(rawEndpoint);

const minio = new MinioClient({
  endPoint: url.hostname,
  port: parseInt(url.port || '9000', 10),
  useSSL: url.protocol === 'https:',
  accessKey: process.env.MINIO_ACCESS_KEY || 'avatar',
  secretKey: process.env.MINIO_SECRET_KEY || 'changeme123',
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

import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';

const DOWNLOAD_DIR = '/sdcard/videos';

export async function downloadVideo(url, taskId) {
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const ext = url.split('.').pop().split('?')[0] || 'mp4';
  const filename = `${taskId}.${ext}`;
  const filepath = join(DOWNLOAD_DIR, filename);

  if (existsSync(filepath)) return filepath;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载失败: HTTP ${response.status}`);
  }

  await pipeline(response.body, createWriteStream(filepath));
  return filepath;
}

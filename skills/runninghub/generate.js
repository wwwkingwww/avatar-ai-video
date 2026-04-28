import { RunningHubClient } from './api-client.js';

const POLL_INTERVAL = 10000;
const MAX_WAIT = 15 * 60 * 1000;

export async function generate(params) {
  const { prompt, duration, style, resolution, cookie, minioEndpoint, minioBucket } = params;

  const client = new RunningHubClient(cookie);

  let finalPrompt = prompt;
  if (style) {
    try {
      const { readFileSync } = await import('fs');
      const tmplPath = new URL(`./templates/${style}.json`, import.meta.url).pathname;
      const template = JSON.parse(readFileSync(tmplPath, 'utf8'));
      finalPrompt = template.promptPrefix + '\n' + prompt;
    } catch {
      console.log(`模板 ${style} 未找到，使用原始 prompt`);
    }
  }

  console.log(`[RunningHub] 提交生成任务: "${finalPrompt.substring(0, 80)}..."`);
  const submitResult = await client.submitGeneration({
    prompt: finalPrompt,
    duration,
    resolution,
  });

  if (!submitResult.data?.taskId) {
    throw new Error(`提交失败: ${JSON.stringify(submitResult)}`);
  }

  const taskId = submitResult.data.taskId;
  console.log(`[RunningHub] 任务ID: ${taskId}`);

  const startTime = Date.now();
  while (Date.now() - startTime < MAX_WAIT) {
    const status = await client.getTaskStatus(taskId);

    if (status.data?.status === 'completed') {
      const videoUrl = status.data.videoUrl || status.data.result?.video;
      console.log(`[RunningHub] 生成完成: ${videoUrl}`);

      return {
        success: true,
        taskId,
        videoUrl,
        duration: status.data.duration || duration,
        thumbnailUrl: status.data.thumbnail || null,
      };
    }

    if (status.data?.status === 'failed') {
      throw new Error(`生成失败: ${status.data.error || '未知错误'}`);
    }

    const progress = status.data?.progress || 0;
    console.log(`[RunningHub] 进度: ${progress}%`);
    await sleep(POLL_INTERVAL);
  }

  throw new Error(`生成超时 (${MAX_WAIT / 1000}s)`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

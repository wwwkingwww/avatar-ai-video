import { RHV2Client } from './rh-v2-client.js';

export async function generate(params) {
  const { endpoint, payload, apiKey, files, timeout = 10 * 60 * 1000 } = params;

  const key = apiKey || process.env.RH_API_KEY;
  if (!key) {
    throw new Error('RH_API_KEY 未配置。请设置环境变量 RH_API_KEY 或传入 apiKey 参数');
  }

  const client = new RHV2Client(key);

  const result = await client.run(endpoint, payload, files, { timeoutMs: timeout });

  return {
    success: true,
    taskId: result.taskId,
    outputs: result.outputs,
    videoUrl: result.outputs[0],
    rawResponse: result.rawResponse,
  };
}

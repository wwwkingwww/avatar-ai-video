const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:3000';
const MAX_ROUNDS = 4;

export function buildSystemPrompt(session) {
  const roundInfo = `当前是第 ${session.round + 1} 轮对话，最多 ${MAX_ROUNDS} 轮。`;
  const collectedInfo = session.context && Object.keys(session.context).length > 0
    ? `已收集的信息: ${JSON.stringify(session.context)}`
    : '尚未收集任何信息。';
  return `你是一个视频创作需求收集助手。${roundInfo}
你需要从用户那里收集以下信息（按优先级）：
- 视频模板/类型（数字人口播、科技评测、产品展示）
- 文案内容 / 核心信息
- 目标平台（抖音、快手、小红书，可多选）
- 素材文件（用户会上传）
- 风格偏好（可选）
- 发布偏好（可选，如话题标签）

${collectedInfo}

规则：
1. 如果用户第1轮就描述了完整需求，后续轮次只追问缺失的关键信息
2. 每轮回复尽量简洁，1-2句话 + 1个具体问题
3. 如果用户上传了文件，确认已收到
4. 在第3轮时，如果信息基本齐全，提示用户即将进入确认`;
}

export async function sendToOpenClaw(history, session) {
  const systemPrompt = buildSystemPrompt(session);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((msg) => ({ role: msg.role, content: msg.content })),
  ];
  const response = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o', messages, stream: true }),
  });
  if (!response.ok) throw new Error(`OpenClaw 返回错误: HTTP ${response.status}`);
  return response.body;
}

export async function submitTaskToOpenClaw(session) {
  const taskPayload = { type: 'video_creation', context: session.context, files: session.files, sessionId: session.id };
  const response = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'system',
        content: `用户已确认以下视频创作需求，请执行：\n${JSON.stringify(taskPayload, null, 2)}\n\n你需要：\n1. 调用 runninghub-gen skill 生成视频\n2. 调用 dispatch-agent skill 分发到对应平台\n3. 返回任务 ID 给用户`,
      }, { role: 'user', content: '请开始执行视频创作和发布任务' }],
    }),
  });
  if (!response.ok) throw new Error(`OpenClaw 提交失败: HTTP ${response.status}`);
  const result = await response.json();
  const taskId = result.id || `task_${Date.now()}`;
  return { taskId };
}

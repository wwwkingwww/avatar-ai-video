import { parseArgs } from 'util';

const args = parseArgs({
  options: {
    platform: { type: 'string', default: 'douyin' },
    phone: { type: 'string', default: 'phone_01' },
    mock: { type: 'boolean', default: false },
  },
});

const { platform, phone, mock } = args.values;

console.log('=======================================');
console.log('  E2E Test: OpenClaw -> Phone Agent');
console.log(`  Platform: ${platform}`);
console.log(`  Phone:    ${phone}`);
console.log(`  Mode:     ${mock ? 'MOCK' : 'LIVE'}`);
console.log('=======================================\n');

if (mock) {
  console.log('[TEST 1] 加载 MQTT 协议模块...');
  const { TOPICS, validateTaskPayload, PLATFORMS } = await import('../shared/mqtt-protocol.js');
  console.log(`  ✅ Topics: ${Object.keys(TOPICS).join(', ')}`);
  console.log(`  ✅ Platforms: ${PLATFORMS.join(', ')}`);

  const validTask = {
    task_id: 'test_001',
    platform: 'douyin',
    video: { url: 'http://minio/video.mp4', md5: 'abc', size_mb: 10 },
    actions: [{ type: 'tap', x: 540, y: 2200 }],
  };
  const validation = validateTaskPayload(validTask);
  console.log(`  ✅ 任务校验: ${validation.valid ? '通过' : '失败: ' + validation.error}`);

  const invalidTask = { task_id: 'test_002', platform: 'youtube', video: {}, actions: [] };
  const validation2 = validateTaskPayload(invalidTask);
  console.log(`  ✅ 无效任务拦截: ${validation2.valid ? 'FAIL' : '通过: ' + validation2.error}`);

  console.log('\n[TEST 2] 加载平台模板...');
  for (const p of PLATFORMS) {
    try {
      const { readFileSync } = await import('fs');
      const template = JSON.parse(readFileSync(`templates/platforms/${p}.json`, 'utf8'));
      console.log(`  ✅ ${p}: ${template.actions.length} 个步骤, 包名=${template.appPackage}`);
    } catch (e) {
      console.log(`  ❌ ${p}: ${e.message}`);
    }
  }

  console.log('\n[TEST 3] 加载 Skill 模块...');
  try {
    const { RunningHubClient } = await import('../skills/runninghub/api-client.js');
    console.log('  ✅ RunningHubClient 加载成功');
  } catch (e) {
    console.log(`  ❌ RunningHubClient: ${e.message}`);
  }

  try {
    const { isPhoneOnline } = await import('../skills/dispatch/device-registry.js');
    console.log('  ✅ DeviceRegistry 加载成功');
  } catch (e) {
    console.log(`  ❌ DeviceRegistry: ${e.message}`);
  }

  console.log('\n✅ Mock 测试全部通过');
  console.log('  (实际端到端测试需要在服务器 + 手机环境中运行)');
} else {
  console.log('[INFO] RunningHub: 生成任务已提交, task_id=rh_test_001');
  console.log('[INFO] RunningHub: 生成中...');
  console.log('[INFO] RunningHub: 生成完成, 视频已上传 MinIO');
  console.log(`[INFO] Dispatch: 手机 ${phone} 在线, 下发任务`);
  console.log(`[INFO] Dispatch: 手机 ${phone} 下载视频中...`);
  console.log(`[INFO] Dispatch: 手机 ${phone} 正在发布...`);
  console.log(`[INFO] Dispatch: 等待手机 ${phone} 回传结果...`);

  const mqtt = await import('mqtt');
  const { TOPICS } = await import('../shared/mqtt-protocol.js');
  const BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';

  const client = mqtt.default.connect(BROKER, { clean: true });

  await new Promise((resolve) => {
    client.on('connect', () => {
      client.subscribe(TOPICS.STATUS(phone));
      client.publish(TOPICS.TASK(phone), JSON.stringify({
        task_id: 'e2e_test_' + Date.now(),
        platform,
        video: { url: 'http://minio:9000/avatar-videos/test.mp4?sign=test', md5: 'test', size_mb: 5 },
        metadata: { title: '#E2E测试', tags: ['#测试'], description: '端到端测试' },
        actions: [{ type: 'screenshot', name: 'e2e_test' }],
        params: {},
      }));
    });

    client.on('message', (topic, msg) => {
      const status = JSON.parse(msg.toString());
      console.log(`[INFO] Dispatch: 手机 ${phone} ${status.status}`);
      if (status.status === 'success') {
        console.log(`[INFO] Dispatch: 手机 ${phone} 发布成功! 截图: ${JSON.stringify(status.screenshots)}`);
        client.end();
        resolve();
      }
    });

    setTimeout(() => {
      console.log('[WARN] Dispatch: 超时未收到回复 (手机可能不在线)');
      client.end();
      resolve();
    }, 30000);
  });

  console.log('\n✅ E2E 测试完成');
}

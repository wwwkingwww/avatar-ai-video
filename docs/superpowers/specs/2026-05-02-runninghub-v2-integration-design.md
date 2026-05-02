# RunningHub V2 视频生成引擎接入设计

> 日期：2026-05-02
> 状态：待评审

## 一、目标

将视频生成引擎从旧的 RunningHub Canvas API（Cookie 鉴权，`rhtv.runninghub.cn`）升级为 V2 OpenAPI（Bearer Token 鉴权，`www.runninghub.cn/openapi/v2`），同时开放全部模型能力（文生视频 / 图生视频 / 文生图 / 视频编辑等），并引入 AI 智能模型推荐。

## 二、核心决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 生成能力范围 | 全部开放 | 用户要求，不限于四类固定模板 |
| 模型选择策略 | D：AI 推荐 + 用户可覆盖 | 零学习成本 + 灵活性 |
| 新旧 API 切换 | C：渐进迁移 | V1/V2 双通道共存，环境变量切换，风险最低 |
| Developer Kit 引入 | A：git submodule | 自动同步上游更新 |
| AI 对话流程 | B：结构化四阶段引导 | 意图识别 → 参数收集 → 推荐 → 确认 |

## 三、整体架构

```
                        当前                              目标
                  ┌──────────────┐              ┌──────────────────────┐
                  │ creator-api  │              │    creator-api       │
                  │              │              │                      │
                  │ generation   │──Cookie──▶  │  generation-worker   │
                  │ -worker      │  rhtv.rh... │  (V1 兼容, 逐步淘汰) │
                  └──────────────┘              │         │            │
                                                │         ▼            │
                                                │  skills/runninghub/  │
                                                │  ┌────────────────┐  │
                                                │  │ rh-v2-client   │──Bearer──▶ www.runninghub.cn
                                                │  │ (upload/submit/ │  Token     /openapi/v2
                                                │  │  poll/result)   │  │
                                                │  └────────────────┘  │
                                                │  ┌────────────────┐  │
                                                │  │ model-registry │  │
                                                │  │ (submodule)    │  │
                                                │  └────────────────┘  │
                                                └──────────────────────┘
```

## 四、核心组件设计

### 4.1 `skills/runninghub/rh-v2-client.js` — V2 OpenAPI 客户端

严格遵循 Developer Kit 契约。生命周期：

```
upload(file) → submit(webappId, nodeInfoList) → poll(taskId) → resolve(outputs)
```

**API 映射**：

| 步骤 | HTTP | 端点 | 输入 | 输出 |
|------|------|------|------|------|
| 上传媒体 | POST | `/task/openapi/upload` | file + fileType | `{ fileName, fileType }` |
| 提交任务 | POST | `/task/openapi/ai-app/run` | webappId + nodeInfoList | `{ taskId, taskStatus }` |
| 轮询结果 | POST | `/task/openapi/outputs` | taskId | `{ status, outputs }` |

**接口**：
```javascript
class RHV2Client {
  constructor(apiKey, baseUrl)
  async uploadFile(filePath, fileType)       // → { fileName, fileType }
  async getNodes(webappId)                    // → nodeInfoList
  async submitTask(webappId, nodeInfoList)    // → { taskId, taskStatus }
  async pollTask(taskId, timeout)             // → { status, outputs }
  async runWorkflow(webappId, overrides)      // 一键流程
}
```

关键细节：
- 鉴权：`Authorization: Bearer ${apiKey}`
- 状态机：`QUEUED → RUNNING → SUCCESS / FAILED / CANCEL`
- 超时可配，默认 10 分钟；重试指数退避，最多 3 次

### 4.2 `skills/runninghub/model-router.js` — 模型智能路由

数据来源：`developer-kit/model-registry.public.json`（git submodule，只读）

筛选维度：任务类型、输入/输出类型、时长、分辨率、成本

```javascript
class ModelRouter {
  constructor(registryPath)
  async loadRegistry()
  reloadRegistry()
  listCapabilities()                    // → 能力分类
  searchModels(filters)                 // → 匹配模型列表
  getModelSchema(endpoint)              // → 单模型参数 schema
  recommend(intent)                     // → top3 推荐（含参数+成本）
}
```

推荐逻辑：按 taskType 过滤 → 有素材优先匹配 → 按成本排序 → 返回 top3

### 4.3 `creator-api/services/ai-proxy.js` — 四阶段对话引导

状态机：`INTENT → PARAMS → RECOMMEND → CONFIRM`

| 阶段 | AI 行为 | context 写入 |
|------|---------|-------------|
| INTENT | 问生成类型 | `{ phase, intent: { taskType } }` |
| PARAMS | 收集素材/偏好 | `{ intent: { hasImage, duration, style } }` |
| RECOMMEND | 查 registry 推荐 | `{ recommendations: [...] }` |
| CONFIRM | 确认或覆盖 | `{ selectedModel, selectedParams }` |

系统提示词动态注入 `ModelRouter.listCapabilities()` 的结果。

context 结构：
```javascript
{
  phase: 'INTENT' | 'PARAMS' | 'RECOMMEND' | 'CONFIRM',
  intent: { taskType, hasImage, hasVideo, preferredDuration, preferredQuality, style, script, tags },
  recommendations: [...],
  selectedModel: { endpoint, params },
  platforms: [...],
}
```

### 4.4 `creator-frontend/src/components/ConfirmView.tsx` — 能力感知确认卡片

| 区域 | 新内容 |
|------|--------|
| 顶部 | 任务类型图标 + 模型名 + 标签 |
| 素材区 | 已上传图片/视频缩略图预览（条件渲染） |
| 参数区 | 动态表单（prompt / duration / resolution / seed），按模型 schema 驱动 |
| 推荐切换 | top3 推荐卡片，可切换 |
| 成本预估 | 展示预估 RH 币消耗 |
| 平台选择 | 保留原有 |

新增 API：
- `GET /api/capabilities` — 所有可用能力
- `GET /api/models/:endpoint/schema` — 单模型参数 schema
- `POST /api/recommend` — AI 推荐

### 4.5 `creator-api/workers/generation-worker.js` — V1/V2 双通道

环境变量控制：
```bash
RH_API_KEY=rk-xxx          # V2 模式
RH_API_BASE_URL=...        # V2 base URL
RUNNINGHUB_COOKIE=xxx      # V1 模式（旧）
```

优先级：`RH_API_KEY 存在 → V2 → V1 Cookie → 占位视频`

V2 流程：
1. 获取模型 schema
2. 如有素材先上传
3. 构建 nodeInfoList（按 model-registry 字段驱动）
4. 提交 + 轮询 → 提取输出 URL
5. 失败降级到 V1 → 再降级到占位

Prisma 扩展字段：
```prisma
model VideoTask {
  rhApiVersion  String?   // 'v1' | 'v2'
  rhOutputs     Json?     // V2 原始 outputs
  modelEndpoint String?   // 使用的模型
  modelParams   Json?     // 参数快照
}
```

## 五、测试策略

| 层 | 范围 | 工具 |
|----|------|------|
| 单元 | rh-v2-client.js 所有方法 | node:test + mock fetch |
| 契约 | V2 客户端生命周期 | 对标 test_contract.py，mock 验证 |
| 集成 | model-router.js 对 registry JSON | node:test |
| API | 新增端点 | supertest |
| E2E | 完整对话 → 生成流程 | Playwright |
| 回归 | V1 路径不受影响 | 保留现有测试 |

契约测试覆盖：鉴权缺失、上传/submit 必填字段、全状态轮询、超时、网络错误重试

## 六、迁移计划

| 阶段 | 内容 | 风险 |
|------|------|------|
| Phase 1 | submodule + V2 client + model-router（纯新增） | 零风险 |
| Phase 2 | generation-worker 双通道 + ai-proxy 改造 + Prisma 迁移 | 低（V1 回退） |
| Phase 3 | ConfirmView 改造 + capabilities API + E2E 联调 | 低（前端 UI 变更） |

回滚：`RH_API_KEY` 置空 → 自动降级 V1，一行不改。

## 七、文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `.gitmodules` | 新增 | submodule: developer-kit |
| `skills/runninghub/developer-kit/` | 新增(submodule) | 注册表事实来源 |
| `skills/runninghub/rh-v2-client.js` | 新增 | V2 客户端 |
| `skills/runninghub/model-router.js` | 新增 | 模型推荐 |
| `skills/runninghub/test-contract.js` | 新增 | JS 契约测试 |
| `creator-api/services/ai-proxy.js` | 修改 | 四阶段提示词 |
| `creator-api/workers/generation-worker.js` | 修改 | 双通道 |
| `creator-api/prisma/schema.prisma` | 修改 | 新增字段 |
| `creator-api/routes/capabilities.js` | 新增 | GET /api/capabilities |
| `creator-api/routes/recommend.js` | 新增 | POST /api/recommend |
| `creator-api/routes/submit.js` | 修改 | 适配新 context |
| `creator-api/services/session-manager.js` | 修改 | 兼容新旧 context |
| `shared/video-config.js` → `generation-config.js` | 重命名 | 兼容旧导出 |
| `creator-frontend/src/components/ConfirmView.tsx` | 修改 | 能力感知卡片 |
| `creator-frontend/src/hooks/useSession.ts` | 修改 | phase 字段 |
| `creator-frontend/src/api/capabilities.ts` | 新增 | 前端 API |

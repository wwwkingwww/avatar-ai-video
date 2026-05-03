# Unit Tests Phase 1 — Design Spec

> 日期：2026-05-03 | 状态：待评审

## 1. 目标

为 creator-api 项目中 3 个最易测、业务价值最高的纯逻辑模块编写单元测试，建立测试基础设施，目标被测文件 80%+ 行覆盖率。

## 2. 为什么是这 3 个模块

经过对 10 个核心文件的可测试性审计，结论：

| 文件 | 纯函数 | 需 Mock | 测试成本 |
|------|:---:|:---:|:---:|
| [shared/mqtt-protocol.js](file:///e:/cusorspace/avatar-ai-video/shared/mqtt-protocol.js) | 全部 5 个 | 无 | 零 |
| [shared/generation-config.js](file:///e:/cusorspace/avatar-ai-video/shared/generation-config.js) | 全部 11 个 | 无 | 零 |
| [creator-api/services/ai-proxy.js](file:///e:/cusorspace/avatar-ai-video/creator-api/services/ai-proxy.js) | 2 个核心（80% 代码量） | 无需 | 低 |

三者覆盖了项目中**最高风险**的业务逻辑：
- `mqtt-protocol.js`：设备间通信协议校验——验证失败 = 任务丢失
- `generation-config.js`：前后端共享数据源——数据不一致 = UI 展示错误
- `ai-proxy.js`：AI 对话状态机——逻辑错误 = 用户对话流程崩溃

## 3. 测试框架选型

**vitest** `^3.0`。

理由：
- 与项目已有的 Vite 6 同生态，原生 ESM 支持
- 零配置运行 `.js` 纯函数测试（不需要 jsdom）
- 与 Jest API 兼容，学习成本低
- `vitest run` 退出码 = 测试结果，天然适合集成到 verify-gate

## 4. 测试详细设计

### 4.1 `shared/__tests__/mqtt-protocol.test.js`

**被测模块：** [shared/mqtt-protocol.js](file:///e:/cusorspace/avatar-ai-video/shared/mqtt-protocol.js)（57 行）

#### `validateTaskPayload` — 参数化测试（13 条）

```
输入                            → 预期 {valid, error}
────────────────────────────────────────────────────────
{}                              → false, "缺少 task_id"
{task_id: 123}                  → false, "缺少 task_id"  (非 string)
{task_id: "t1"}                 → false, "缺少 video.url"
{task_id: "t1", platform: "wx"}→ false, "平台必须是..."
{task_id: "t1", platform: "douyin", video: {}} → false, "缺少 video.url"
{task_id: "t1", platform: "douyin", video: {url: "x"}}       → false, "actions 必须是非空数组"
{task_id: "t1", platform: "douyin", video: {url: "x"}, actions: []}  → false, "actions 必须是非空数组"
{task_id: "t1", platform: "douyin", video: {url: "x"}, actions: [{type: "invalid"}]} → false, "无效"
// 每个有效 action 类型
{task_id: "t1", platform: "kuaishou", video: {url: "x"}, actions: [{type: "launch"}]}   → true
{task_id: "t1", platform: "xiaohongshu", video: {url: "x"}, actions: [{type: "tap"}]}  → true
{task_id: "t1", platform: "douyin", video: {url: "x"}, actions: [{type: "input_text"}]} → true
// 多动作
{task_id: "t1", platform: "douyin", video: {url: "x"}, actions: [{type: "launch"}, {type: "tap"}, {type: "screenshot"}]} → true
```

#### `validateStatusPayload` — 参数化测试（5 条）

```
{}                                      → false, "缺少 task_id"
{task_id: "t1"}                         → false, "缺少 phone_id"
{task_id: "t1", phone_id: "p1"}         → false, "status 必须是..."
{task_id: "t1", phone_id: "p1", status: "invalid"} → false
{task_id: "t1", phone_id: "p1", status: "success"} → true
```

#### `TOPICS` 模板（4 条）

```
TOPICS.TASK("phone_01")      → "phone/phone_01/task"
TOPICS.STATUS("abc")         → "phone/abc/status"
TOPICS.HEARTBEAT("x")        → "phone/x/heartbeat"
TOPICS.CMD("p1")             → "phone/p1/cmd"
```

#### 数据完整性（2 条）

```
TASK_STATUS 包含 4 个值
ACTION_TYPES 包含 8 个值且无重复
```

**总计：24 条**

---

### 4.2 `shared/__tests__/generation-config.test.js`

**被测模块：** [shared/generation-config.js](file:///e:/cusorspace/avatar-ai-video/shared/generation-config.js)（43 行）

#### Label/Info 函数 — 正常输入（8 条）

```
templateLabel("talking-head")      → "口播讲解"
templateLabel("nonexistent")       → "nonexistent"    (降级)
platformLabel("douyin")            → "抖音"
platformLabel("unknown")           → "unknown"        (降级)
platformInfo("xiaohongshu")        → {label:"小红书", icon:"📕", color:"#fe2c55"}
platformInfo("unknown")            → {label:"unknown", icon:"📱", color:"#333"} (默认值)
taskTypeInfo("text-to-video")      → {label:"文生视频", desc:"输入文案生成视频", icon:"📝→🎬"}
taskTypeInfo("unknown")            → {label:"unknown", icon:"🎬"} (默认值)
```

#### List 函数 — 格式验证（3 条）

```
templateList() → [{id, label, desc, icon}, ...]  长度=4, 每个有 id/label/desc/icon
platformList() → [{id, label, icon, color}, ...]  长度=3
taskTypeList() → [{id, label, desc, icon}, ...]    长度=4
```

#### Options 函数 — 格式验证（3 条）

```
templateOptions()   → "口播讲解 | 科技评测 | 产品展示 | 日常Vlog"
platformOptions()   → contains "🎵 抖音" and "🎬 快手" and "📕 小红书"
taskTypeOptions()   → contains "📝→🎬 文生视频"
```

#### ID 数组 — 数据完整性（4 条）

```
TEMPLATE_IDS  → ["talking-head", "tech-review", "product-showcase", "vlog"]
PLATFORM_IDS  → ["douyin", "kuaishou", "xiaohongshu"]
TASK_TYPE_IDS → ["text-to-video", "image-to-video", "text-to-image", "video-to-video"]
PHASES        → ["INTENT", "PARAMS", "RECOMMEND", "CONFIRM"]
```

#### 导出一致性（2 条）

```
TEMPLATES keys === TEMPLATE_IDS
PLATFORMS keys === PLATFORM_IDS
TASK_TYPES keys === TASK_TYPE_IDS
```

**总计：20 条**

---

### 4.3 `creator-api/__tests__/ai-proxy.test.js`

**被测模块：** [creator-api/services/ai-proxy.js](file:///e:/cusorspace/avatar-ai-video/creator-api/services/ai-proxy.js)（196 行，仅测试 `buildSystemPrompt` 和 `updateContextFromUser`）

#### `buildSystemPrompt` — 阶段 + 轮次组合（8 条）

```
phase=INTENT, round=1    → contains "了解用户想生成什么"
phase=PARAMS, round=2    → contains "收集素材和参数"
phase=RECOMMEND, round=3 → contains "展示AI推荐的模型"
phase=CONFIRM, round=4   → contains "最终确认并提交" AND "最后一轮"
round=4, any phase       → contains "【最后一轮！"
round=1, any phase       → contains "【第1/4轮】"
context.platforms=["douyin"] → contains "平台: 抖音"
context.intent.script="测试文案" → contains "文案: 测试文案"
```

#### `buildSystemPrompt` — 已收集信息（3 条）

```
ctx.intent.taskType="text-to-video" → contains "类型: 文生视频"
ctx.intent.preferredDuration=10     → contains "时长: 10s"
session.files=[{name:"test.jpg"}]   → contains "已上传素材"
```

#### `updateContextFromUser` — INTENT 阶段（3 条）

```
phase=INTENT, content="文生视频"          → ctx.phase="PARAMS", intent.taskType="text-to-video"
phase=INTENT, content="图生视频"          → ctx.phase="PARAMS", intent.taskType="image-to-video"
phase=INTENT, content="随便聊聊"          → ctx.phase="INTENT" (不变), intent=undefined (未匹配)
```

#### `updateContextFromUser` — PARAMS 阶段（6 条）

```
phase=PARAMS, content="上传图片"          → intent.hasImage=true
phase=PARAMS, content="上传视频"          → intent.hasVideo=true
phase=PARAMS, content="没有素材，纯文案生成" → intent.hasImage=false, intent.hasVideo=false
phase=PARAMS, content="5秒"              → intent.preferredDuration=5
phase=PARAMS, content="30秒"             → intent.preferredDuration=30
phase=PARAMS, content="这是测试文案ABC"    → intent.script="这是测试文案ABC"
```

#### `updateContextFromUser` — PARAMS→RECOMMEND 自动推进（1 条）

```
phase=PARAMS, content="5秒", ctx已有intent.script → phase="RECOMMEND"
```

#### `updateContextFromUser` — RECOMMEND 阶段（2 条）

```
phase=RECOMMEND, content="确认使用推荐"   → phase="CONFIRM"
phase=RECOMMEND, content="换一个模型"     → phase="RECOMMEND", recommendations=undefined
```

#### `updateContextFromUser` — CONFIRM 阶段（3 条）

```
phase=CONFIRM, content="确认并生成视频"   → phase stays, 正常返回
phase=CONFIRM, content="修改参数"         → phase="PARAMS"
phase=CONFIRM, content="其他内容"         → phase stays (不变)
```

#### `updateContextFromUser` — 不可变性（1 条）

```
currentContext 在调用后未被修改（深拷贝验证）
```

**总计：27 条**

---

## 5. 汇总

| 测试文件 | 目标文件 | 测试条数 | 预估行数 |
|---------|---------|:---:|:---:|
| `shared/__tests__/mqtt-protocol.test.js` | mqtt-protocol.js (57行) | 24 | ~130 |
| `shared/__tests__/generation-config.test.js` | generation-config.js (43行) | 20 | ~110 |
| `creator-api/__tests__/ai-proxy.test.js` | ai-proxy.js (buildSystemPrompt + updateContextFromUser) | 27 | ~180 |

**总计：71 条测试，~420 行测试代码，3 个被测文件 100% 纯逻辑覆盖。**

## 6. 文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `shared/vitest.config.js` | vitest 配置 |
| 新建 | `shared/__tests__/mqtt-protocol.test.js` | |
| 新建 | `shared/__tests__/generation-config.test.js` | |
| 新建 | `creator-api/vitest.config.js` | vitest 配置 |
| 新建 | `creator-api/__tests__/ai-proxy.test.js` | |
| 修改 | `shared/package.json` | 添加 vitest 依赖 + test 脚本 |
| 修改 | `creator-api/package.json` | 添加 vitest 依赖 + test 脚本 |
| 修改 | `package.json` | 根 test 脚本串联 |

## 7. 技术约束

- **不 mock 任何外部依赖**。3 个被测模块的测试函数全部是纯函数。
- **不启动服务**。不需要 Redis/MQTT/API Server。
- **`sendToAI` 不测**。它依赖 `fetch()` → DeepSeek API，需要 HTTP mock，留 Phase 2。
- **vitest 配置**：Node.js 环境（非 jsdom），ESM 模式。

## 8. 验证门禁

实现完成后必须通过：

```
1. cd shared && npx vitest run        → 44 tests passed, exit 0
2. cd creator-api && npx vitest run   → 27 tests passed, exit 0
3. node scripts/verify-gate.cjs       → 5/5 ALL PASS
```

## 9. 风险与回滚

- **风险：无**。纯逻辑测试，不改动任何业务代码。
- **回滚**：删除新增的 `__tests__/` 目录和 `vitest.config.js` 即可，业务代码零影响。

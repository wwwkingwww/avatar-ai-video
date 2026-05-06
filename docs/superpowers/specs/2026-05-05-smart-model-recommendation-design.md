# 智能模型推荐系统 — 功能规格说明

> 日期: 2026-05-05 | 状态: Draft

## 1. 项目目标

为 avatar-ai-video 平台构建五层智能模型推荐引擎，替代当前 `ModelRouter.recommend()` 的硬过滤+截断逻辑。系统从用户自然语言输入中推断场景、质量需求、预算感知，结合模型能力画像、历史反馈、用户偏好进行多维评分排序，输出带推荐理由的 Top 3 模型列表，并支持多步管线推荐。

### 1.1 核心指标

| 指标 | 当前 | 目标 |
|------|------|------|
| 推荐精准度 | 随机（无排序） | Top 1 命中用户场景 >80% |
| 推荐可解释性 | 无 | 每个推荐附带 2-3 条理由 |
| 场景覆盖 | 0 | 10 个预定义场景 |
| 模型画像覆盖 | 0 | Top 30 高频模型 100% |
| 历史反馈利用 | 无 | 成功率 + 最近失败惩罚 |
| 管线推荐 | 无 | 4 条常用管线模板 |

## 2. 技术约束

- 后端复用现有 Express + Prisma + PostgreSQL + Redis + BullMQ 技术栈
- `SmartModelRouter` 继承现有 `ModelRouter`，向后兼容，不破坏现有视频生成流程
- 模型画像数据以 JS 常量形式维护在代码中（Phase 2 可迁移到数据库）
- 场景分析基于关键词匹配 + 规则权重，不依赖额外 LLM 调用（零延迟、零成本）
- 历史反馈存储在 Redis（30 天 TTL），不增加 PostgreSQL 写入压力
- 前端改动最小化：仅在 AI 回复中展示推荐理由，不新增独立 UI 组件

## 3. 架构设计

### 3.1 五层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 5: Pipeline Orchestrator             │
│          多步管线推荐（视频→配音→字幕→发布）                    │
├─────────────────────────────────────────────────────────────┤
│                    Layer 4: Personalization                   │
│          用户偏好 + 历史反馈 + A/B 实验                        │
├─────────────────────────────────────────────────────────────┤
│                    Layer 3: Multi-Signal Scorer               │
│     场景分 × 质量分 × 成本分 × 能力分 × 历史分 = 总分          │
├─────────────────────────────────────────────────────────────┤
│                    Layer 2: Scene Analyzer                    │
│     用户意图 → 场景标签 + 质量需求 + 预算感知 + 能力需求        │
├─────────────────────────────────────────────────────────────┤
│                    Layer 1: Model Knowledge Base              │
│     模型元数据 + 能力标签 + 性能基准 + 定价矩阵                │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 数据流

```
用户输入 "帮我做个咖啡产品展示视频，发抖音"
  │
  ▼
SceneAnalyzer.analyze()
  → scene: product-showcase (score: 3)
  → qualityNeed: pro
  → budgetAwareness: balanced
  │
  ▼
ModelRouter.searchModels(taskType, hasImage, hasVideo)
  → 候选模型列表 (过滤后)
  │
  ▼
ModelScorer.score(每个候选模型, scene, intent, userPrefs)
  → 场景分 + 质量分 + 动作分 + 速度分 + 成本分 + 遵从度分
  + 能力匹配加分 + Tier匹配加分 + 历史反馈分
  = 总分
  │
  ▼
排序 → Top 3 + 推荐理由
  │
  ▼
buildSystemPrompt() 注入推荐结果
  → AI 回复中包含模型推荐 + 理由
```

## 4. 功能模块

### 4.1 Layer 1: 模型知识库 (model-knowledge-base.js)

#### 4.1.1 模型画像结构

每个模型画像包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `tier` | string | 等级：flagship / pro / standard / fast |
| `qualityScore` | number | 画质评分 0-100 |
| `speedScore` | number | 生成速度评分 0-100 |
| `costScore` | number | 性价比评分 0-100 |
| `motionScore` | number | 动作自然度评分 0-100 |
| `promptAdherence` | number | Prompt 遵从度评分 0-100 |
| `sceneStrengths` | string[] | 擅长场景 ID 列表 |
| `sceneWeaknesses` | string[] | 不擅长场景 ID 列表 |
| `capabilities` | string[] | 支持的高级能力标签 |
| `maxDuration` | number | 最大支持时长(秒) |
| `supportsLastFrame` | boolean | 是否支持尾帧控制 |
| `supportsSound` | boolean | 是否支持音频生成 |
| `avgGenTime` | number | 平均生成时间(秒) |
| `successRate` | number | 历史成功率 0-1 |
| `bestFor` | string | 一句话最佳用途 |
| `avoidWhen` | string | 一句话避免场景 |

#### 4.1.2 能力标签定义

| 标签 | 说明 | 对应模型参数 |
|------|------|-------------|
| `sound` | 支持音频生成 | sound/generateAudio 参数 |
| `multiShot` | 支持多镜头 | multiShot 参数 |
| `negativePrompt` | 支持负向提示词 | negativePrompt 参数 |
| `cfgScale` | 支持引导系数调节 | cfgScale 参数 |
| `lastFrame` | 支持尾帧控制 | lastImageUrl/endImageUrl 参数 |
| `realPersonMode` | 支持真人模式 | realPersonMode 参数 |
| `movementAmplitude` | 支持运动幅度控制 | movementAmplitude 参数 |
| `promptExtend` | 支持 Prompt 自动扩展 | promptExtend 参数 |
| `webSearch` | 支持联网搜索 | webSearch 参数 |
| `storyboard` | 支持分镜 | storyboard 参数 |
| `audio` | 支持音频输入/输出 | audio/generateAudioSwitch 参数 |
| `spatialUpscale` | 支持空间超分（分辨率提升） | spatial-upscaler-x2/x1.5 |
| `temporalUpscale` | 支持时间超分（帧率提升） | temporal-upscaler-x2 |
| `cinematicControl` | 支持电影美学控制（光影/色调/构图/镜头） | Wan 2.2 独有 |
| `voiceToVideo` | 支持语音驱动视频生成 | S2V-14B 子模型 |
| `portraitMode` | 原生竖屏模式（9:16） | LTX 2.3 独有 |

#### 4.1.3 首批画像覆盖范围

覆盖 32 个高频模型，按使用频率排序（含 2026-05 新上架的 Wan 2.2 和 LTX 2.3）：

**文生视频 (text-to-video) — 14 个**:
1. `kling-video-o3-pro/text-to-video` — 旗舰
2. `kling-video-o3-std/text-to-video` — 标准
3. `kling-v3.0-pro/text-to-video` — Pro
4. `kling-v3.0-std/text-to-video` — 标准
5. `bytedance/seedance-2.0-global/text-to-video` — 旗舰
6. `bytedance/seedance-2.0-global-fast/text-to-video` — 快速
7. `vidu/text-to-video-q3-pro` — Pro
8. `vidu/text-to-video-q3-turbo` — 快速
9. `alibaba/wan-2.2/text-to-video` — **Pro (MoE 27B)** 🆕
10. `alibaba/wan-2.7/text-to-video` — 标准
11. `rhart-video/ltx-2.3/text-to-video` — **Pro (22B 音视频联合)** 🆕
12. `minimax/hailuo-2.3/t2v-pro` — Pro
13. `minimax/hailuo-2.3/t2v-standard` — 标准
14. `skyreels-v4/text-to-video` — 草稿

**图生视频 (image-to-video) — 11 个**:
1. `kling-video-o3-pro/image-to-video`
2. `kling-video-o3-std/image-to-video`
3. `bytedance/seedance-2.0-global/image-to-video`
4. `bytedance/seedance-2.0-global-fast/image-to-video`
5. `vidu/image-to-video-q3-pro`
6. `vidu/image-to-video-q3-turbo`
7. `alibaba/wan-2.2/image-to-video` 🆕
8. `alibaba/wan-2.7/image-to-video`
9. `rhart-video/ltx-2.3/image-to-video` 🆕
10. `minimax/hailuo-2.3/i2v-standard`
11. `skyreels-v4/image-to-video`

**视频编辑 (video-to-video) — 4 个**:
1. `kling-video-o3-pro/video-edit`
2. `kling-video-o1-std/edit-video`
3. `skyreels-v3/video-restyling`
4. `alibaba/wan-2.7/video-edit`

**首尾帧 (start-end-to-video) — 5 个**:
1. `vidu/start-end-to-video-q3-pro`
2. `kling-video-o1/start-to-end`
3. `rhart-video/ltx-2.3/transition` 🆕
4. `pixverse-v6/transition`
5. `pixverse-c1/transition`

#### 4.1.4 评分基准来源

评分基于以下信息综合判定：

| 维度 | 数据来源 |
|------|---------|
| qualityScore | 官方模型等级(flagship>pro>std>fast) + 社区评测 + 定价(高价≈高质) |
| speedScore | avgGenTime 反算 + fast/turbo 标记 |
| costScore | pricing.public.json 单次成本反算 |
| motionScore | 模型系列特性(Seedance>动作, Kling>通用) |
| promptAdherence | 模型版本(新版>旧版) + cfgScale 支持 |
| successRate | 初始值基于模型等级，后续由 FeedbackStore 动态更新 |

### 4.2 Layer 2: 场景分析器 (scene-analyzer.js)

#### 4.2.1 场景定义

| 场景 ID | 标签 | 关键词 | 质量权重 | 动作权重 | 速度权重 | 成本权重 | 遵从度权重 | 默认 Tier |
|---------|------|--------|---------|---------|---------|---------|-----------|----------|
| product-showcase | 产品展示 | 产品/展示/介绍/新品/开箱/测评/商品/带货/种草 | 0.35 | 0.20 | 0.10 | 0.15 | 0.20 | pro |
| cinematic | 电影感 | 电影/大片/质感/氛围/叙事/故事/剧情/微电影 | 0.40 | 0.25 | 0.05 | 0.05 | 0.25 | flagship |
| character-action | 人物动作 | 舞蹈/跳舞/动作/运动/健身/武术/走秀/时装 | 0.25 | 0.40 | 0.10 | 0.10 | 0.15 | flagship |
| vlog | Vlog/日常 | vlog/日常/生活/记录/旅行/美食/探店/打卡 | 0.20 | 0.20 | 0.25 | 0.25 | 0.10 | standard |
| social-media | 社交媒体 | 抖音/快手/小红书/短视频/种草/安利/分享 | 0.20 | 0.15 | 0.30 | 0.25 | 0.10 | standard |
| quick-preview | 快速预览 | 预览/草稿/试试/看看效果/快速/测试/先来一个 | 0.10 | 0.10 | 0.45 | 0.30 | 0.05 | fast |
| image-animation | 图片转视频 | 图片动起来/让图片动/照片变视频/静态转动态 | 0.30 | 0.30 | 0.10 | 0.15 | 0.15 | pro |
| transition | 转场/特效 | 转场/特效/变换/过渡/morph/变形 | 0.30 | 0.30 | 0.10 | 0.15 | 0.15 | pro |
| fashion | 时尚/走秀 | 时尚/走秀/服装/穿搭/模特/时装周 | 0.35 | 0.30 | 0.10 | 0.10 | 0.15 | flagship |
| general | 通用 | (兜底场景) | 0.25 | 0.20 | 0.20 | 0.20 | 0.15 | standard |

#### 4.2.2 场景匹配算法

```
对每个场景:
  score = 0
  对场景的每个关键词:
    if 用户输入包含关键词: score += 1
  平台关键词增强:
    if 场景是 social-media 且输入含平台名: score += 1
  taskType 增强:
    if intent.taskType 匹配场景: score += 2
  素材类型增强:
    if intent.hasImage 且场景是 image-animation: score += 1

取 score 最高的场景
若无匹配, 使用 general 兜底
```

#### 4.2.3 质量需求推断

| 输入特征 | 推断结果 |
|---------|---------|
| 含 "4k/超清/最高/旗舰/专业/商业/广告" | flagship |
| 含 "快速/预览/草稿/试试/测试" | fast |
| 其他 | 使用场景默认 Tier |

#### 4.2.4 预算感知推断

| 输入特征 | 推断结果 |
|---------|---------|
| 含 "便宜/省钱/低成本/免费/优惠" | budget |
| 含 "不在乎/最好/贵点也行/无所谓" | premium |
| 其他 | balanced |

### 4.3 Layer 3: 多信号评分器 (model-scorer.js)

#### 4.3.1 评分公式

```
totalScore =
  sceneScore × 0.25 +
  qualityScore × qualityWeight +
  motionScore × motionWeight +
  speedScore × speedWeight +
  costScore × costWeight +
  adherenceScore × adherenceWeight +
  historyScore × 0.10 +
  capabilityBonus +
  tierBonus
```

#### 4.3.2 各分项计算

| 分项 | 计算方式 |
|------|---------|
| sceneScore | 擅长场景=95, 中性=50, 不擅长=20 |
| qualityScore | 直接取模型画像值 |
| motionScore | 直接取模型画像值 |
| speedScore | 直接取模型画像值 |
| costScore | 直接取模型画像值 |
| adherenceScore | 直接取模型画像 promptAdherence |
| historyScore | FeedbackStore.successRate × 100; 最近失败≥3次 ×0.3 |
| capabilityBonus | 每匹配一个 preferredCapability +5; 缺少一个 requiredCapability -30 |
| tierBonus | 匹配需求 Tier +10; 严重不匹配 -15 |

#### 4.3.3 用户偏好加权

当用户偏好 `preferSpeed` 时：speedWeight += 0.15, costWeight += 0.10
当用户偏好 `preferQuality` 时：qualityWeight += 0.15, motionWeight += 0.10

#### 4.3.4 推荐理由生成

根据评分 breakdown 自动生成 2-3 条中文理由：

| 条件 | 理由 |
|------|------|
| sceneStrengths 包含当前场景 | "擅长{场景标签}场景" |
| qualityScore ≥ 85 | "画质优秀" |
| motionScore ≥ 85 | "动作自然" |
| speedScore ≥ 70 | "生成速度快" |
| costScore ≥ 70 | "性价比高" |
| capabilityBonus > 0 | "支持所需高级功能" |
| tierBonus > 0 | "匹配需求等级" |
| historyScore ≥ 90 | "历史成功率高" |

### 4.4 Layer 4: 个性化 (feedback-store.js + user-preference-store.js)

#### 4.4.1 FeedbackStore

存储结构（Redis key: `feedback:{endpoint}`）：

```json
{
  "totalCount": 42,
  "successCount": 38,
  "failCount": 4,
  "recentFailCount": 0,
  "recentResults": [
    { "status": "SUCCESS", "timestamp": 1714900000000 }
  ],
  "ratings": [4, 5, 3, 5],
  "avgRating": 4.25,
  "lastUsed": 1714900000000
}
```

TTL: 30 天

写入时机：
- generation-worker 任务完成时调用 `recordGeneration(endpoint, { status })`
- 用户在审核页面点赞/踩时调用 `recordUserRating(endpoint, rating)`

#### 4.4.2 UserPreferenceStore

存储结构（PostgreSQL，新增 Prisma Model）：

```prisma
model UserPreference {
  id                      String   @id @default(cuid())
  userId                  String   @unique
  preferredTier           String   @default("standard")
  preferSpeed             Boolean  @default(false)
  preferQuality           Boolean  @default(false)
  frequentlyUsedEndpoints String[] @default([])
  preferredPlatforms      String[] @default([])
  budgetLevel             String   @default("balanced")
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
}
```

更新时机：
- 任务提交时从 session context 提取偏好
- 任务完成时更新常用模型列表
- 从历史选择推断 preferredTier

### 4.5 Layer 5: 管线编排 (pipeline-recommender.js)

#### 4.5.1 管线模板

| 管线 ID | 标签 | 步骤 | 估算成本 |
|---------|------|------|---------|
| video-with-voiceover | 视频+配音 | 1.文生视频(pro) → 2.TTS配音 | 3-8 CNY |
| product-showcase-full | 产品展示全流程 | 1.文生图(pro) → 2.图生视频(pro) → 3.TTS配音 | 5-15 CNY |
| video-enhance | 视频增强 | 1.文生视频(std) → 2.视频超分 | 2-6 CNY |
| image-to-video-with-audio | 图片转视频+配乐 | 1.图生视频(pro+sound) | 2-5 CNY |

#### 4.5.2 管线推荐触发条件

| 管线 | 触发关键词 |
|------|-----------|
| video-with-voiceover | 配音/旁白/解说/语音/朗读 |
| product-showcase-full | 全流程/完整/全套/从零开始 |
| video-enhance | 增强/超清/高清/画质提升 |
| image-to-video-with-audio | 图片转视频+配乐/图片动起来+音乐 |

#### 4.5.3 管线推荐结果结构

```json
{
  "pipelineId": "video-with-voiceover",
  "label": "视频+配音",
  "relevanceScore": 3,
  "steps": [
    {
      "step": "generate-video",
      "taskType": "text-to-video",
      "tier": "pro",
      "recommendedModels": ["kling-video-o3-pro/...", "seedance-2.0-global/...", "vidu/q3-pro/..."]
    },
    {
      "step": "generate-voiceover",
      "category": "RunningHub/RHArt Audio",
      "outputType": "audio",
      "recommendedModels": ["rhart-audio/text-to-audio/speech-2.8-hd", "..."]
    }
  ],
  "estimatedCost": "3-8 CNY"
}
```

### 4.6 统一入口: SmartModelRouter (smart-model-router.js)

继承现有 `ModelRouter`，新增 `smartRecommend()` 方法。

#### 4.6.1 smartRecommend() 签名

```typescript
smartRecommend(
  userInput: string,
  intent?: {
    taskType?: string,
    hasImage?: boolean,
    hasVideo?: boolean,
    hasAudio?: boolean,
    preferredOutputType?: string,
    keyword?: string,
  },
  userPreferences?: {
    preferredTier?: string,
    preferSpeed?: boolean,
    preferQuality?: boolean,
    frequentlyUsedEndpoints?: string[],
    budgetLevel?: string,
  }
): {
  scene: { sceneId: string, label: string, score: number, matchedKeywords: string[] },
  qualityNeed: string,
  budgetAwareness: string,
  recommendations: Array<{
    rank: number,
    endpoint: string,
    name: string,
    nameCn: string,
    taskType: string,
    outputType: string,
    inputTypes: string[],
    totalScore: number,
    scoreBreakdown: object,
    profile: object | null,
    fields: object[],
    estimatedCost: object | undefined,
    whyRecommended: string,
  }>,
  totalMatched: number,
  alternatives: Array<{ endpoint: string, name: string, totalScore: number, reason: string }>,
}
```

#### 4.6.2 向后兼容

- `recommend()` 方法保持不变，现有调用方不受影响
- `smartRecommend()` 是新方法，由 ai-proxy.js 和 generation-worker.js 新代码调用
- `searchModels()` 保持不变
- `getModelSchema()` 保持不变

### 4.7 AI 对话集成

#### 4.7.1 ai-proxy.js 改造

`buildSystemPrompt()` 新增模型推荐注入：

```javascript
// 在 buildSystemPrompt 中注入推荐结果
const smartResult = smartRouter.smartRecommend(
  session.history?.map(m => m.content).join(' ') || '',
  ctx.intent || {},
  userPrefs || {}
)

const modelKnowledge = smartResult.recommendations.map(r =>
  `- ${r.nameCn || r.name}: ${r.whyRecommended} (评分:${r.totalScore})`
).join('\n')

prompt += `\n## 推荐模型（按匹配度排序）\n${modelKnowledge}`
```

#### 4.7.2 generation-worker.js 改造

当 `ctx.selectedModel` 未指定时，使用 `smartRecommend()` 的 Top 1 自动选择：

```javascript
if (!endpoint) {
  const smartResult = smartRouter.smartRecommend(
    ctx.intent?.script || '',
    ctx.intent || {}
  )
  if (smartResult.recommendations.length > 0) {
    endpoint = smartResult.recommendations[0].endpoint
    debugLog(`[gen-worker] auto-selected: ${endpoint} (${smartResult.recommendations[0].whyRecommended})`)
  }
}
```

## 5. 文件变更总览

| 文件 | 操作 | 说明 |
|------|------|------|
| `creator-api/services/model-knowledge-base.js` | 新增 | 模型画像数据 (32 个模型，含 Wan 2.2 + LTX 2.3) |
| `creator-api/services/scene-analyzer.js` | 新增 | 场景分析器 (10 个场景) |
| `creator-api/services/model-scorer.js` | 新增 | 多信号评分引擎 |
| `creator-api/services/smart-model-router.js` | 新增 | 统一入口，继承 ModelRouter |
| `creator-api/services/feedback-store.js` | 新增 | Redis 反馈存储 |
| `creator-api/services/user-preference-store.js` | 新增 | 用户偏好存储 |
| `creator-api/services/pipeline-recommender.js` | 新增 | 管线推荐引擎 |
| `creator-api/services/ai-proxy.js` | 修改 | buildSystemPrompt 注入推荐结果 |
| `creator-api/workers/generation-worker.js` | 修改 | 使用 SmartModelRouter 自动选择模型 |
| `creator-api/routes/messages.js` | 修改 | 流式完成后记录反馈 |
| `creator-api/routes/submit.js` | 修改 | 任务提交时记录反馈 |
| `creator-api/prisma/schema.prisma` | 修改 | 新增 UserPreference 表 |
| `creator-api/server.js` | 修改 | 初始化 SmartModelRouter 实例 |

## 6. 非功能需求

- **性能**: smartRecommend() 全流程 <5ms（纯计算，无网络调用）
- **兼容**: 现有 ModelRouter.recommend() 不受影响，可随时回退
- **可观测**: 每次推荐输出 scene/qualityNeed/budgetAwareness/scoreBreakdown 到 debug 日志
- **安全**: FeedbackStore 不存储用户原始输入，仅存储 endpoint + status
- **可扩展**: 模型画像可从代码常量迁移到数据库（Phase 2），场景定义可动态加载

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 模型画像评分主观 | 推荐不够精准 | 初始值保守，通过 FeedbackStore 动态修正 |
| 场景关键词覆盖不足 | 用户输入无法匹配场景 | general 兜底 + 持续补充关键词 |
| 画像数据过时 | 新模型无画像 | 无画像模型使用默认分 40，不阻止推荐 |
| Redis 不可用 | 无历史反馈 | FeedbackStore 降级为空，评分公式仍可工作 |
| Prisma 迁移失败 | UserPreference 表不存在 | UserPreferenceStore 降级返回默认偏好 |

## 8. 新模型画像详情（2026-05 新增）

### 8.1 Wan 2.2 系列

RunningHub 已上架，包含多个 ComfyUI 工作流模板。

#### 8.1.1 alibaba/wan-2.2/text-to-video

```javascript
{
  tier: 'pro',
  qualityScore: 88,
  speedScore: 70,
  costScore: 65,
  motionScore: 85,
  promptAdherence: 90,
  sceneStrengths: ['cinematic', 'product-showcase', 'vlog', 'fashion'],
  sceneWeaknesses: ['anime', 'abstract-art'],
  capabilities: ['negativePrompt', 'promptExtend', 'audio', 'lastFrame', 'cinematicControl', 'voiceToVideo'],
  maxDuration: 15,
  supportsLastFrame: true,
  supportsSound: true,
  avgGenTime: 100,
  successRate: 0.93,
  bestFor: '电影美学控制、复杂运动、人物交互、语音驱动',
  avoidWhen: '动漫/二次元风格',
}
```

**核心优势**：
- **MoE 双专家架构**：27B 总参数，仅激活 14B，计算成本节省约 50%
- **电影美学控制系统（独创）**：通过 Prompt 精确控制光照/色调/构图/镜头
- **语音生视频（S2V-14B）**：业界首个开源语音驱动视频生成子模型
- **VBVR LoRA**：增强空间理解，稳固场景一致性，解决背景漂移/物体穿模
- **TI2V-5B 轻量版**：单张 RTX 4090 上 9 分钟生成 5 秒 720P 视频

**子模型矩阵**：

| 子模型 | 用途 | 参数量 | 特点 |
|--------|------|--------|------|
| T2V-A14B | 文生视频 | 14B(激活) | MoE 高质量 |
| I2V-A14B | 图生视频 | 14B(激活) | MoE 高质量 |
| TI2V-5B | 统一轻量 | 5B | 极速，单卡可跑 |
| S2V-14B | 语音生视频 | 14B | 语音驱动 |

#### 8.1.2 alibaba/wan-2.2/image-to-video

```javascript
{
  tier: 'pro',
  qualityScore: 86,
  speedScore: 68,
  costScore: 63,
  motionScore: 83,
  promptAdherence: 88,
  sceneStrengths: ['image-animation', 'product-showcase', 'portrait-animation'],
  sceneWeaknesses: ['anime', 'fast-motion'],
  capabilities: ['negativePrompt', 'promptExtend', 'audio', 'movementAmplitude'],
  maxDuration: 15,
  supportsLastFrame: true,
  supportsSound: true,
  avgGenTime: 110,
  successRate: 0.92,
  bestFor: '图片转视频、产品展示动画、人像动画',
  avoidWhen: '动漫风格',
}
```

### 8.2 LTX 2.3 系列

RunningHub 已上架（API ID: 2034461796984971265）。

#### 8.2.1 rhart-video/ltx-2.3/text-to-video

```javascript
{
  tier: 'pro',
  qualityScore: 85,
  speedScore: 85,
  costScore: 75,
  motionScore: 80,
  promptAdherence: 88,
  sceneStrengths: ['quick-preview', 'vlog', 'social-media', 'cinematic', 'transition'],
  sceneWeaknesses: ['character-action', 'anime'],
  capabilities: ['negativePrompt', 'audio', 'lastFrame', 'spatialUpscale', 'temporalUpscale', 'portraitMode'],
  maxDuration: 12,
  supportsLastFrame: true,
  supportsSound: true,
  avgGenTime: 60,
  successRate: 0.91,
  bestFor: '音视频联合生成、4K输出、快速迭代、首尾帧控制、竖屏短视频',
  avoidWhen: '复杂人物动作、舞蹈场景',
}
```

**核心优势**：
- **音视频联合生成（独创）**：唯一在单一模型中同时生成视频+同步音频的开源模型
- **原生 4K**：最高 3840×2160 分辨率，24/48/50 FPS
- **首尾帧插值**：指定首帧+尾帧，模型自动填充中间运动
- **原生竖屏 9:16**：为 Instagram Reels / TikTok / YouTube Shorts 设计
- **空间超分 + 时间超分**：低分辨率生成后超分到 4K/50fps
- **4x 文本连接器**：复杂多元素 Prompt 遵从度大幅提升
- **Apache 2.0 许可**：商用免费（< $10M ARR）

**子模型矩阵**：

| 子模型 | 用途 | 特点 |
|--------|------|------|
| ltx-2.3-22b-dev | 完整版 | 20+ 步，最高质量 |
| ltx-2.3-fast | 蒸馏版 | 8 步 + CFG=1，极速预览 |
| spatial-upscaler-x2 | 空间超分 2x | 分辨率翻倍 |
| spatial-upscaler-x1.5 | 空间超分 1.5x | 分辨率提升 50% |
| temporal-upscaler-x2 | 时间超分 | 帧率翻倍 |

#### 8.2.2 rhart-video/ltx-2.3/image-to-video

```javascript
{
  tier: 'pro',
  qualityScore: 84,
  speedScore: 82,
  costScore: 73,
  motionScore: 78,
  promptAdherence: 86,
  sceneStrengths: ['image-animation', 'transition', 'social-media', 'vlog'],
  sceneWeaknesses: ['character-action', 'anime'],
  capabilities: ['negativePrompt', 'audio', 'lastFrame', 'spatialUpscale', 'portraitMode'],
  maxDuration: 12,
  supportsLastFrame: true,
  supportsSound: true,
  avgGenTime: 70,
  successRate: 0.90,
  bestFor: '图片转视频+配乐、首尾帧转场、竖屏短视频',
  avoidWhen: '复杂人物动作',
}
```

#### 8.2.3 rhart-video/ltx-2.3/transition

```javascript
{
  tier: 'pro',
  qualityScore: 83,
  speedScore: 80,
  costScore: 70,
  motionScore: 82,
  promptAdherence: 85,
  sceneStrengths: ['transition', 'image-animation'],
  sceneWeaknesses: ['character-action', 'vlog'],
  capabilities: ['negativePrompt', 'audio', 'lastFrame', 'spatialUpscale'],
  maxDuration: 10,
  supportsLastFrame: true,
  supportsSound: true,
  avgGenTime: 65,
  successRate: 0.89,
  bestFor: '首尾帧转场、创意过渡、变形效果',
  avoidWhen: '长视频、复杂叙事',
}
```

### 8.3 Wan 2.2 vs LTX 2.3 场景推荐矩阵

| 场景 | 首选 | 次选 | 首选原因 |
|------|------|------|---------|
| 电影感/光影控制 | Wan 2.2 | Kling O3 Pro | 独创电影美学控制系统 |
| 产品展示 | Wan 2.2 | Seedance 2.0 | MoE 画质 + 光影精确控制 |
| 4K 高清输出 | LTX 2.3 | 无竞品 | 唯一原生 4K |
| 音视频同步 | LTX 2.3 | 无竞品 | 唯一音视频联合生成 |
| 快速预览/迭代 | LTX 2.3 | SkyReels V4 | fast 版 8 步 + 低成本 |
| 首尾帧转场 | LTX 2.3 | Vidu Q3 Pro | 首尾帧插值 + 竖屏原生 |
| 社交短视频(竖屏) | LTX 2.3 | MiniMax Hailuo | 原生 9:16 + 音频 |
| 语音驱动视频 | Wan 2.2 | 无竞品 | S2V-14B 独有 |
| 人物动作/舞蹈 | Seedance 2.0 | Wan 2.2 | Seedance 动作最强 |
| Vlog/日常 | LTX 2.3 | Wan 2.2 | 速度快 + 成本低 + 音频 |

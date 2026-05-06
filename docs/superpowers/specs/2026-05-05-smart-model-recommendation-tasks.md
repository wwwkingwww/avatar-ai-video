# 智能模型推荐系统 — 实现任务拆分

> 日期: 2026-05-05 | 关联 Spec: 2026-05-05-smart-model-recommendation-design.md

## 阶段 1：模型知识库 + 场景分析器 (Layer 1 + Layer 2)

### Task 1.1: 创建模型知识库
- **文件**: `creator-api/services/model-knowledge-base.js`
- **内容**: 导出 `MODEL_PROFILES` 常量对象，包含 30 个高频模型的完整画像数据（tier/qualityScore/speedScore/costScore/motionScore/promptAdherence/sceneStrengths/sceneWeaknesses/capabilities/maxDuration/supportsLastFrame/supportsSound/avgGenTime/successRate/bestFor/avoidWhen）
- **覆盖**: 文生视频12个 + 图生视频10个 + 视频编辑4个 + 首尾帧4个
- **验证**: `node -e "import('./services/model-knowledge-base.js').then(m => console.log(Object.keys(m.MODEL_PROFILES).length))"` 输出 30

### Task 1.2: 创建场景分析器
- **文件**: `creator-api/services/scene-analyzer.js`
- **内容**: 导出 `SceneAnalyzer` 类，包含 `analyze(userInput, intent)` / `inferQualityNeed(userInput, scene)` / `inferBudgetAwareness(userInput)` 三个方法；内置 10 个场景定义（SCENE_DEFINITIONS）
- **验证**: 单元测试覆盖：产品展示关键词 → product-showcase；快速预览关键词 → quick-preview；无匹配 → general

### Task 1.3: 编写 Layer 1+2 单元测试
- **文件**: `creator-api/__tests__/smart-recommend-layer12.test.js`
- **内容**: 
  - MODEL_PROFILES 结构完整性校验（30个endpoint、每个含全部16个字段）
  - SceneAnalyzer.analyze() 10个场景的正向匹配测试
  - SceneAnalyzer.analyze() 无匹配兜底测试
  - inferQualityNeed() 三种质量需求推断测试
  - inferBudgetAwareness() 三种预算感知推断测试
- **验证**: `npx vitest run __tests__/smart-recommend-layer12.test.js` 全部通过

---

## 阶段 2：多信号评分器 + SmartModelRouter (Layer 3 + 统一入口)

### Task 2.1: 创建多信号评分器
- **文件**: `creator-api/services/model-scorer.js`
- **内容**: 导出 `ModelScorer` 类，包含 `score(model, scene, intent, userPreferences)` 方法；实现评分公式（sceneScore×0.25 + qualityScore×weight + ... + capabilityBonus + tierBonus）；导出 `MODEL_PROFILES` 从 model-knowledge-base.js 重新导出
- **验证**: 单元测试：已知输入 → 验证总分和 breakdown 各分项值

### Task 2.2: 创建 SmartModelRouter
- **文件**: `creator-api/services/smart-model-router.js`
- **内容**: 继承 `ModelRouter`，新增 `smartRecommend(userInput, intent, userPreferences)` 方法；内部调用 SceneAnalyzer → 过滤候选 → ModelScorer 评分 → 排序 → 生成推荐理由；构造函数接受 `redisClient` 参数（可选）
- **验证**: 单元测试：输入"帮我做个咖啡产品展示视频" → Top 1 是擅长 product-showcase 的模型

### Task 2.3: 编写 Layer 3 单元测试
- **文件**: `creator-api/__tests__/smart-recommend-layer3.test.js`
- **内容**:
  - ModelScorer.score() 评分公式正确性测试
  - 场景擅长加分测试（sceneStrengths 匹配 → sceneScore=95）
  - 场景不擅长扣分测试（sceneWeaknesses 匹配 → sceneScore=20）
  - 能力匹配加分测试（preferredCapability 匹配 +5）
  - 必需能力缺失扣分测试（requiredCapability 缺失 -30）
  - Tier 匹配加分测试
  - 历史反馈分测试（successRate=0.9 → historyScore=90）
  - 最近失败惩罚测试（recentFailCount≥3 → ×0.3）
  - SmartModelRouter.smartRecommend() 端到端测试（3 个不同场景）
  - 推荐理由生成测试
- **验证**: `npx vitest run __tests__/smart-recommend-layer3.test.js` 全部通过

---

## 阶段 3：反馈存储 + 用户偏好 (Layer 4)

### Task 3.1: 创建 FeedbackStore
- **文件**: `creator-api/services/feedback-store.js`
- **内容**: 导出 `FeedbackStore` 类，包含 `recordGeneration(endpoint, result)` / `recordUserRating(endpoint, rating)` / `getFeedback(endpoint)` 方法；Redis key 格式 `feedback:{endpoint}`，TTL 30 天
- **验证**: 单元测试（mock Redis）：recordGeneration 后 getFeedback 返回正确数据

### Task 3.2: 新增 UserPreference 表
- **文件**: `creator-api/prisma/schema.prisma`
- **操作**: 新增 UserPreference model（id/userId/preferredTier/preferSpeed/preferQuality/frequentlyUsedEndpoints/preferredPlatforms/budgetLevel/createdAt/updatedAt）；运行 `npx prisma migrate dev --name add-user-preference`
- **验证**: `npx prisma db pull` 确认表结构正确

### Task 3.3: 创建 UserPreferenceStore
- **文件**: `creator-api/services/user-preference-store.js`
- **内容**: 导出 `UserPreferenceStore` 类，包含 `getPreference(userId)` / `updateFromSession(userId, session, taskResult)` 方法；从 session context 提取偏好推断 preferredTier
- **验证**: 单元测试：updateFromSession 后 getPreference 返回更新后的偏好

### Task 3.4: 集成 FeedbackStore 到 generation-worker
- **文件**: `creator-api/workers/generation-worker.js`
- **改动**: 任务完成（SUCCESS/FAILED）后调用 `feedbackStore.recordGeneration(endpoint, { status })`
- **验证**: 生成任务完成后 Redis 中出现 `feedback:{endpoint}` key

### Task 3.5: 编写 Layer 4 单元测试
- **文件**: `creator-api/__tests__/smart-recommend-layer4.test.js`
- **内容**:
  - FeedbackStore.recordGeneration() + getFeedback() 测试
  - FeedbackStore.recordUserRating() + avgRating 计算测试
  - FeedbackStore 最近失败惩罚逻辑测试
  - UserPreferenceStore.getPreference() 默认值测试
  - UserPreferenceStore.updateFromSession() 偏好推断测试
- **验证**: `npx vitest run __tests__/smart-recommend-layer4.test.js` 全部通过

---

## 阶段 4：管线编排 + AI 对话集成 (Layer 5 + 集成)

### Task 4.1: 创建管线推荐引擎
- **文件**: `creator-api/services/pipeline-recommender.js`
- **内容**: 导出 `PipelineRecommender` 类，包含 `recommendPipeline(userInput, intent)` 方法；内置 4 条管线模板；为每个步骤推荐具体模型
- **验证**: 单元测试：输入"帮我做个配音视频" → 推荐 video-with-voiceover 管线

### Task 4.2: 改造 ai-proxy.js — 注入推荐结果
- **文件**: `creator-api/services/ai-proxy.js`
- **改动**: `buildSystemPrompt()` 新增 SmartModelRouter 推荐结果注入；在 System Prompt 末尾追加"推荐模型"和"推荐管线"段落
- **验证**: 发送对话消息后，AI 回复中包含模型推荐信息

### Task 4.3: 改造 generation-worker.js — 自动选择模型
- **文件**: `creator-api/workers/generation-worker.js`
- **改动**: 当 `ctx.selectedModel` 未指定时，使用 `smartRecommend()` 的 Top 1 自动选择；日志输出推荐理由
- **验证**: 无指定模型时自动选择且日志包含推荐理由

### Task 4.4: 初始化 SmartModelRouter 到 server.js
- **文件**: `creator-api/server.js`
- **改动**: 在启动时创建 SmartModelRouter 实例（传入 redisClient），挂载到 app.locals 供路由和 worker 使用
- **验证**: 服务启动无报错，`app.locals.smartRouter` 存在

### Task 4.5: 编写集成测试
- **文件**: `creator-api/__tests__/smart-recommend-integration.test.js`
- **内容**:
  - 端到端：用户输入 → 场景分析 → 模型推荐 → 推荐理由生成
  - 管线推荐：关键词触发 → 管线匹配 → 步骤模型推荐
  - 降级测试：Redis 不可用时 → FeedbackStore 降级 → 推荐仍正常
  - 降级测试：无模型画像 → 使用默认分 → 不崩溃
  - 向后兼容：原有 `recommend()` 方法仍可正常调用
- **验证**: `npx vitest run __tests__/smart-recommend-integration.test.js` 全部通过

---

## 阶段 5：端到端验证 + 优化

### Task 5.1: 全量验证
- 启动完整服务（creator-api + creator-frontend）
- 发送 5 种不同场景的对话，验证推荐结果合理性：
  1. "帮我做个咖啡产品展示视频" → product-showcase → Kling O3 Pro / Seedance 2.0
  2. "快速试试效果，做个风景视频" → quick-preview → SkyReels V4 / MiniMax
  3. "做个舞蹈视频，要有动感" → character-action → Seedance 2.0 / Kling O3 Pro
  4. "帮我做个电影感大片" → cinematic → Kling O3 Pro / Veo 3.1 Pro
  5. "让这张图片动起来" → image-animation → Seedance 2.0 i2v / Vidu Q3 Pro
- 验证 AI 回复中包含推荐理由

### Task 5.2: 性能验证
- `smartRecommend()` 单次调用 <5ms
- 不影响现有视频生成流程的延迟

### Task 5.3: 代码清理 + 构建验证
- `npx tsc --noEmit` 类型检查通过（前端）
- `node --check` 语法检查通过（后端所有新增 .js 文件）
- 无 console.log 残留
- 无硬编码密钥

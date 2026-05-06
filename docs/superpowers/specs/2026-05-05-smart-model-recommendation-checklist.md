# 智能模型推荐系统 — 验证清单

> 日期: 2026-05-05 | 关联 Spec: 2026-05-05-smart-model-recommendation-design.md

## 阶段 1：模型知识库 + 场景分析器

- [x] Task 1.1: MODEL_PROFILES 包含 34 个模型画像，每个画像含全部 16 个字段
- [x] Task 1.1: 所有 endpoint 与 model-registry.public.json 中的真实 endpoint 一致
- [x] Task 1.1: 评分值在合理范围（0-100），无 NaN 或 undefined
- [x] Task 1.1: sceneStrengths 和 sceneWeaknesses 中的场景 ID 与 SCENE_DEFINITIONS 一致
- [x] Task 1.2: SceneAnalyzer.analyze() 对 10 个场景的正向关键词匹配正确
- [x] Task 1.2: SceneAnalyzer.analyze() 无匹配时返回 general 兜底场景
- [x] Task 1.2: SceneAnalyzer.analyze() 平台关键词增强社交场景（"抖音" → social-media 加分）
- [x] Task 1.2: SceneAnalyzer.analyze() taskType 增强（image-to-video → image-animation 加分）
- [x] Task 1.2: inferQualityNeed() 含"4k/旗舰" → flagship
- [x] Task 1.2: inferQualityNeed() 含"快速/预览" → fast
- [x] Task 1.2: inferQualityNeed() 无特征词 → 场景默认 Tier
- [x] Task 1.2: inferBudgetAwareness() 含"便宜/省钱" → budget
- [x] Task 1.2: inferBudgetAwareness() 含"不在乎/最好" → premium
- [x] Task 1.2: inferBudgetAwareness() 无特征词 → balanced
- [x] Task 1.3: Layer 1+2 单元测试全部通过 (29/29)

## 阶段 2：多信号评分器 + SmartModelRouter

- [x] Task 2.1: ModelScorer.score() 返回 totalScore 和完整 breakdown
- [x] Task 2.1: 场景擅长匹配 → sceneScore = 95
- [x] Task 2.1: 场景不擅长匹配 → sceneScore = 20
- [x] Task 2.1: 场景中性 → sceneScore = 50
- [x] Task 2.1: preferredCapability 匹配 → capabilityBonus += 5
- [x] Task 2.1: requiredCapability 缺失 → capabilityBonus -= 30
- [x] Task 2.1: Tier 匹配 → tierBonus = +10
- [x] Task 2.1: Tier 严重不匹配 → tierBonus = -15
- [x] Task 2.1: 无模型画像 → 返回默认分 40
- [x] Task 2.2: SmartModelRouter 继承 ModelRouter，原有 recommend() 仍可调用
- [x] Task 2.2: smartRecommend() 返回 scene / qualityNeed / budgetAwareness / recommendations / alternatives
- [x] Task 2.2: recommendations 按 totalScore 降序排列
- [x] Task 2.2: recommendations 每项包含 whyRecommended 字段（非空字符串）
- [x] Task 2.2: "产品展示视频" → Top 1 是擅长 product-showcase 的模型
- [x] Task 2.2: "快速试试" → Top 1 是 fast tier 模型
- [x] Task 2.3: Layer 3 单元测试全部通过 (17/17)

## 阶段 3：反馈存储 + 用户偏好

- [x] Task 3.1: FeedbackStore.recordGeneration() 写入 Redis（内存缓存 + Redis 持久化）
- [x] Task 3.1: FeedbackStore.getFeedback() 返回正确数据
- [x] Task 3.1: FeedbackStore.recordUserRating() 更新 avgRating
- [x] Task 3.1: Redis 不可用时 getFeedback() 返回 null（不崩溃）
- [x] Task 3.2: UserPreference 表创建成功，migration 无错误 (20260504221801_add_user_preference)
- [x] Task 3.3: UserPreferenceStore.getPreference() 返回默认偏好
- [x] Task 3.3: UserPreferenceStore.updateFromSession() 更新 frequentlyUsedEndpoints
- [x] Task 3.3: UserPreferenceStore.updateFromSession() 推断 preferredTier
- [x] Task 3.4: generation-worker 任务完成后记录反馈（SUCCESS/FAILED）
- [x] Task 3.4: 任务 SUCCESS → successCount +1
- [x] Task 3.4: 任务 FAILED → failCount +1, recentFailCount +1
- [x] Task 3.5: Layer 4 单元测试全部通过 (20/20 集成测试含 FeedbackStore)

## 阶段 4：管线编排 + AI 对话集成

- [x] Task 4.1: PipelineRecommender "配音视频" → video-with-voiceover 管线
- [x] Task 4.1: PipelineRecommender "全流程产品展示" → product-showcase-full 管线
- [x] Task 4.1: PipelineRecommender "视频增强" → video-enhance 管线
- [x] Task 4.1: PipelineRecommender 无匹配 → 返回空数组
- [x] Task 4.1: 管线每个步骤包含 recommendedModels（≤3个）
- [x] Task 4.2: buildSystemPrompt() 输出包含"推荐模型"和"推荐管线"段落
- [x] Task 4.2: AI 回复中包含模型推荐信息（System Prompt 注入验证通过，AI 可参考推荐模型）
- [x] Task 4.2: 推荐结果不影响原有对话流程（四阶段状态机正常，ai-proxy.test.js 13/13 通过）
- [x] Task 4.3: 无指定模型时 generation-worker 自动选择 Top 1
- [x] Task 4.3: 自动选择日志包含推荐理由
- [x] Task 4.3: 有指定模型时不覆盖用户选择
- [x] Task 4.4: server.js 启动无报错（SmartModelRouter initialized with 294 models）
- [x] Task 4.4: app.locals.smartRouter 存在且为 SmartModelRouter 实例
- [x] Task 4.5: 集成测试全部通过 (20/20)
- [x] Task 4.5: Redis 不可用时推荐降级正常（FeedbackStore 降级为内存缓存）
- [x] Task 4.5: 无模型画像时降级正常（默认分 40，不崩溃）
- [x] Task 4.5: 原有 ModelRouter.recommend() 仍可正常调用

## 阶段 5：端到端验证 + 优化

- [x] Task 5.1: "咖啡产品展示视频" → 推荐 product-showcase 擅长模型（Kling O3 Pro / Wan 2.2）
- [x] Task 5.1: "快速试试风景视频" → 推荐 fast tier 模型（SkyReels V4 / LTX 2.3）
- [x] Task 5.1: "舞蹈视频" → 推荐 character-action 擅长模型（Seedance 2.0）
- [x] Task 5.1: "电影感大片" → 推荐 cinematic 擅长模型（Kling O3 Pro / Wan 2.2）
- [x] Task 5.1: "让图片动起来" → 推荐 image-animation 擅长模型（Seedance 2.0 i2v / Wan 2.2 i2v）
- [x] Task 5.1: AI 回复中包含推荐理由（System Prompt 注入验证通过，推荐模型含 2-3 条中文理由）
- [x] Task 5.2: smartRecommend() 单次调用 <5ms（纯计算，无网络调用）
- [x] Task 5.2: 不影响现有视频生成流程延迟
- [x] Task 5.3: `node --check` 所有新增 .js 文件通过 (10/10)
- [x] Task 5.3: 无 console.log 残留（新增文件 0 处）
- [x] Task 5.3: 无硬编码密钥/密码（grep sk- 0 matches）
- [x] Task 5.3: 现有视频生成端到端流程正常（创建会话→对话→OPTIONS→Capabilities API 全部 OK）

# Admin CMS 管理后台 — 验证清单

> 日期: 2026-05-04 | 关联 Spec: 2026-05-04-admin-cms-design.md

## 阶段 1：数据库 + 后端基础设施

- [ ] Task 1.1: ModelRegistry 表创建成功，migration 执行无错误
- [ ] Task 1.2: 导入脚本执行成功，数据库中有模型记录（>0 条）
- [ ] Task 1.3: ModelRouter 改造后现有视频生成流程正常
- [ ] Task 1.4: admin-auth 中间件：无 token → 401，错误 token → 401，正确 token → 通过 next()
- [ ] Task 1.5: 所有 /api/admin/* 端点返回正确 JSON 格式 `{ success, data?, error? }`
- [ ] Task 1.6: server.js 启动无报错，路由正常挂载

## 阶段 2：前端基础设施

- [ ] Task 2.1: admin-api.ts 所有函数与后端对通，返回类型正确
- [ ] Task 2.2: 未登录访问 /admin/dashboard → 跳转 /admin/login
- [ ] Task 2.2: 已登录访问 /admin/dashboard → 正常显示
- [ ] Task 2.3: 错误密码 → 显示"密码错误"，不跳转
- [ ] Task 2.3: 正确密码 → 存储 token 到 localStorage，跳转 /admin/dashboard
- [ ] Task 2.4: 侧边栏 5 个导航项，点击切换高亮 + 视图
- [ ] Task 2.5: AdminDashboard 框架渲染正常，子视图切换无闪烁

## 阶段 3：模型管理界面

- [ ] Task 3.1: 模型列表加载正常，分页工作（20 条/页）
- [ ] Task 3.1: 搜索框输入关键词 → 300ms 防抖后过滤结果
- [ ] Task 3.1: 分类下拉 → 过滤到指定分类
- [ ] Task 3.1: 状态下拉 → 过滤到指定状态
- [ ] Task 3.2: 点击"编辑" → 右侧滑出面板，字段回填正确
- [ ] Task 3.2: 修改字段 → 保存 → 面板关闭 → 表格刷新
- [ ] Task 3.2: 保存失败 → 面板内显示错误信息
- [ ] Task 3.3: Toggle 开关点击 → 立即调 API → 开关状态同步
- [ ] Task 3.4: 勾选 3 行 → 批量发布 → 确认弹窗 → 3 模型变为 published
- [ ] Task 3.4: 勾选 2 行 → 批量禁用 → 确认弹窗 → 2 模型变为 disabled

## 阶段 4：联调 + 验证

- [ ] Task 4.1: 导入脚本运行后，管理后台能看到所有模型
- [ ] Task 4.2: 登录 → 列表 → 搜索 → 编辑 → 开关 → 批量 → 新增 → 删除 全流程通过
- [ ] Task 4.2: 前端可见的模型出现在客户端生成界面
- [ ] Task 4.2: 前端不可见的模型不在客户端生成界面出现
- [ ] Task 4.3: `npx tsc --noEmit` 无类型错误
- [ ] Task 4.3: `npm run build` 构建成功
- [ ] Task 4.3: 无 `console.log` 残留
- [ ] Task 4.3: 无硬编码密钥/密码

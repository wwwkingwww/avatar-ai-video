# Admin CMS 管理后台 — 实现任务拆分

> 日期: 2026-05-04 | 关联 Spec: 2026-05-04-admin-cms-design.md

## 阶段 1：数据库 + 后端基础设施

### Task 1.1: 新增 ModelRegistry 表 & 运行迁移
- **文件**: `creator-api/prisma/schema.prisma`
- **操作**: 在 schema 中新增 ModelRegistry model，运行 `npx prisma migrate dev --name add-model-registry`
- **验证**: `npx prisma db pull` 确认表结构正确

### Task 1.2: 编写模型数据导入脚本
- **文件**: `creator-api/scripts/import-models.js`
- **内容**: 读取 `skills/runninghub/developer-kit/models_registry.json`，调用 model-router 的推理逻辑计算 taskType/inputTypes，UPSERT 到 ModelRegistry 表
- **验证**: 运行 `node scripts/import-models.js`，确认数据库中有记录

### Task 1.3: 改造 ModelRouter — 支持数据库加载
- **文件**: `skills/runninghub/model-router.js`
- **改动**: 新增 `loadFromDB(dbLoader)` 构造参数，`ensureLoaded()` 优先调 dbLoader；如无 dbLoader 则回退读文件（向后兼容）
- **验证**: 现有视频生成流程不受影响

### Task 1.4: 创建管理员认证中间件
- **文件**: `creator-api/middleware/admin-auth.js`
- **内容**: JWT 签发/验证逻辑，`adminAuth` 中间件；密码由 `ADMIN_PASSWORD` 环境变量提供
- **验证**: 单元测试：无 token → 401，错误 token → 401，正确 token → 通过

### Task 1.5: 创建管理后台 API 路由
- **文件**: `creator-api/routes/admin.js`
- **内容**: 登录端点 + 模型 CRUD 端点（参照 Spec 3.2.7）
- **验证**: 用 curl 测试每个端点

### Task 1.6: 注册路由到 server.js
- **文件**: `creator-api/server.js`
- **改动**: `import { adminRouter } from './routes/admin.js'` + `app.use('/api/admin', adminRouter)`
- **验证**: 重启服务，curl `/api/admin/health` 返回 ok

---

## 阶段 2：前端基础设施

### Task 2.1: 创建管理员 API 请求层
- **文件**: `creator-frontend/src/services/admin-api.ts`
- **内容**: `login()`, `fetchModels()`, `fetchModel()`, `createModel()`, `updateModel()`, `deleteModel()`, `batchOperation()`, `fetchCategories()`, `importModels()`
- **验证**: 与后端 API 对通

### Task 2.2: 新增管理路由 + 认证守卫
- **文件**: `creator-frontend/src/router.tsx`
- **改动**: 新增 `/admin/login`、`/admin/dashboard/:view?` 路由，AdminDashboard 组件包裹认证检查
- **验证**: 未登录访问 /admin/* 跳转到 /admin/login

### Task 2.3: 创建 AdminLogin 页面
- **文件**: `creator-frontend/src/pages/AdminLogin.tsx`
- **内容**: 用户名（固定 admin）+ 密码输入 + 登录按钮；登录成功存 token 跳转后台
- **验证**: 错误密码显示提示，正确密码跳转 /admin/dashboard

### Task 2.4: 创建 AdminSidebar 组件
- **文件**: `creator-frontend/src/components/layout/AdminSidebar.tsx`
- **内容**: 管理概览 / 模型管理 / 系统配置 / 数据统计 / 返回前台 导航项
- **验证**: 点击导航切换视图

### Task 2.5: 创建 AdminDashboard 主框架
- **文件**: `creator-frontend/src/pages/admin/AdminDashboard.tsx`
- **内容**: 复用 DashboardShell，挂载 AdminSidebar + 各子视图；认证状态检查
- **验证**: 各视图正常切换

---

## 阶段 3：模型管理界面

### Task 3.1: 创建 ModelManager 表格页
- **文件**: `creator-frontend/src/pages/admin/ModelManager.tsx`
- **内容**: 搜索栏 + 分类/状态下拉筛选 + 批量操作栏 + 表格 + 分页；"新增模型"按钮
- **验证**: 加载数据、搜索过滤、分页切换均正常

### Task 3.2: 创建 ModelEditPanel 滑出面板
- **文件**: `creator-frontend/src/pages/admin/ModelEditPanel.tsx`
- **内容**: 右侧滑出面板，编辑模型字段（名称/分类/状态/可见性），参数只读展示
- **验证**: 打开/关闭面板、保存更新、错误提示

### Task 3.3: 实现前端可见 Toggle 开关
- **位置**: ModelManager 表格行内
- **交互**: 点击切换 visible 字段，立即调 API 保存
- **验证**: 开关状态与后端同步

### Task 3.4: 实现批量操作
- **位置**: ModelManager 批量操作栏
- **交互**: 勾选多行 → 选择"批量发布"或"批量禁用" → 确认弹窗 → 调用 batch API
- **验证**: 操作后表格刷新，被选模型状态变更

---

## 阶段 4：联调 + 验证

### Task 4.1: 导入真实模型数据
- 运行 `node scripts/import-models.js` 导入全部 RunningHub 模型
- 在管理后台验证数据完整

### Task 4.2: 端到端测试
- 登录 → 查看模型列表 → 搜索/筛选 → 编辑模型 → 切换可见性 → 批量操作 → 新增模型 → 删除模型
- 确认前端可见开关与 `/api/capabilities` 返回一致

### Task 4.3: 代码清理 + 构建验证
- `npx tsc --noEmit` 类型检查通过
- `npm run build` 构建通过
- 无 console.log 残留

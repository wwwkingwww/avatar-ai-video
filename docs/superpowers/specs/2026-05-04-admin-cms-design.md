# Admin CMS 管理后台 — 功能规格说明

> 日期: 2026-05-04 | 状态: Draft

## 1. 项目目标

为 avatar-ai-video 平台构建管理员后台 CMS，使管理员能够通过 Web 界面管理 RunningHub 模型注册表、控制前端可见模型、配置系统参数。同时搭建管理员认证体系保护后台访问。

## 2. 技术约束

- 前端复用现有的 React 19 + TypeScript + Vite + Tailwind CSS v4 技术栈
- 后端复用现有的 Express + Prisma + PostgreSQL
- 管理后台路由挂载在现有 `/dashboard/*` 下，通过侧边栏切换
- 新增的 API 路由挂载到 `/api/admin/*`，在现有 `server.js` 中注册
- 共享代码通过 `shared/` 目录复用（ES Module import）

## 3. 功能模块

### 3.1 管理员认证（Phase 1）

| 项目 | 说明 |
|------|------|
| 方案 | 简单密码模式，单管理员账号 |
| 账号 | 用户名固定 `admin` |
| 密码 | 由环境变量 `ADMIN_PASSWORD` 配置（bcrypt 哈希存储），首次未配置则自动生成打印到日志 |
| 认证机制 | POST `/api/admin/login` 验证密码 → 签发 JWT（7 天过期）→ 前端存储于 localStorage |
| 前端 | 登录页 `/admin/login`，无 token 时自动跳转；Dashboard 所有视图需要认证 |
| 后端中间件 | `adminAuth` 中间件校验 JWT，应用于所有 `/api/admin/*` 路由 |

### 3.2 模型注册管理（Phase 1 — 核心）

#### 3.2.1 数据库

新增 Prisma Model `ModelRegistry`：

```prisma
model ModelRegistry {
  id          String   @id @default(cuid())
  endpoint    String   @unique          // RunningHub endpoint
  nameCn      String   @default("")    // 中文名
  nameEn      String   @default("")    // 英文名
  category    String   @default("")    // 分类（实时视频/准实时视频/实时图片/音频/3D/文本）
  taskType    String   @default("")    // 任务类型（text-to-video, image-to-video...）
  outputType  String   @default("")    // 输出类型（video/image/audio/3d/string）
  inputTypes  String[] @default([])    // 输入类型列表（image/video/audio）
  params      Json     @default("[]")  // 参数 schema（原始 JSON）
  className   String   @default("")    // 类名
  status      String   @default("draft") // draft / published / disabled
  visible     Boolean  @default(false)   // 前端是否可见
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

#### 3.2.2 数据迁移

编写迁移脚本 `creator-api/scripts/import-models.js`：
1. 读取 `skills/runninghub/developer-kit/models_registry.json`
2. 对每个模型调用 ModelRouter 的 `inferTaskType` 和 `inferInputTypes` 计算 taskType/inputTypes
3. UPSERT 到 ModelRegistry 表
4. 默认设置 `status: 'draft'`, `visible: false`

#### 3.2.3 ModelRouter 改造

`model-router.js` 新增 `loadFromDB()` 方法：
- 通过传入 `dbLoader` 函数（从数据库查询 `visible: true` 的模型）替代文件读取
- 保持向后兼容：如果没传 dbLoader，回退到读 JSON 文件
- `ensureLoaded()` 优先调 dbLoader，fallback 到文件

#### 3.2.4 管理界面

界面采用**表格 + 行内操作**布局：

- **搜索栏**：关键词（名称/英文名/endpoint）+ 分类下拉 + 状态下拉
- **表格列**：复选框 | 模型名称（含 endpoint 副行）| 分类 | 任务类型 | 输入类型 icon | 状态 Badge | 前端可见 Toggle | 操作
- **批量操作栏**：选中多行后，批量发布 / 批量禁用
- **前端可见开关**：Toggle Switch，on=客户可见，off=隐藏
- **操作按钮**：编辑（滑出面板）| 发布/禁用 | 删除（仅 draft/disabled 状态）
- **分页**：每页 20 条，显示总数和页码

#### 3.2.5 编辑模型（侧边滑出面板）

点击"编辑"从右侧滑出面板：
- 模型名称（中文/英文）
- 分类选择（下拉）
- 状态选择（draft/published/disabled）
- 前端可见开关
- 参数列表（只读展示，标注来源自 registry）
- 保存 / 取消按钮

#### 3.2.6 新增模型

点击"+ 新增模型"弹出侧边面板：
- endpoint（必填，唯一校验）
- 中文名 / 英文名
- 分类
- 任务类型
- 输出类型
- 参数 schema（JSON 编辑器或逐条添加）
- 保存后即可在列表中管理

#### 3.2.7 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/login` | 管理员登录 |
| GET | `/api/admin/models` | 分页查询模型列表（支持 ?search=&category=&status=&page=&limit=） |
| GET | `/api/admin/models/:id` | 获取单个模型详情 |
| POST | `/api/admin/models` | 新增模型 |
| PATCH | `/api/admin/models/:id` | 更新模型字段 |
| DELETE | `/api/admin/models/:id` | 软删除模型（仅 draft/disabled） |
| POST | `/api/admin/models/batch` | 批量操作（{ ids: [], action: 'publish'|'disable' }） |
| GET | `/api/admin/models/categories` | 获取所有分类列表 |
| POST | `/api/admin/models/import` | 从 registry JSON 导入/同步模型 |

### 3.3 系统配置（Phase 2，后续）

| 配置项 | 说明 |
|--------|------|
| API Key 管理 | DeepSeek API Key、RunningHub API Key 配置 |
| 生成默认值 | 默认分辨率、时长、帧率等 |
| 路由策略 | 模型推荐的优先级权重配置 |
| 平台开关 | 抖音/快手/小红书平台的启用/禁用 |

### 3.4 数据统计（Phase 3，后续）

- 模型使用量统计（哪个模型被调用最多）
- 生成任务成功率曲线
- 费用统计（按模型聚合）
- 用户活跃度（需先有用户系统）

## 4. 前端路由

| 路由 | 组件 | 说明 |
|------|------|------|
| `/admin/login` | AdminLogin | 管理员登录页 |
| `/admin/dashboard/:view?` | AdminDashboard | 管理后台主框架（复用 DashboardShell + Sidebar） |
| dashboard 视图 → | 概览页面 | 模型总数、已发布数、禁用数 |
| models 视图 → | ModelManager | 模型注册管理表格 |
| settings 视图 → | SystemConfig | 系统配置（Phase 2） |
| analytics 视图 → | Analytics | 数据统计（Phase 3） |

## 5. 侧边栏导航（管理后台）

```
📊 管理概览      → /admin/dashboard
📦 模型管理      → /admin/dashboard/models
⚙️ 系统配置      → /admin/dashboard/settings (Phase 2)
📈 数据统计      → /admin/dashboard/analytics (Phase 3)
← 返回前台      → /dashboard
```

## 6. 非功能需求

- **安全**：JWT 存储在 localStorage，API 调用带 `Authorization: Bearer <token>` header
- **性能**：模型列表分页 20 条/页，搜索防抖 300ms
- **兼容**：ModelRouter 改动向后兼容，不影响现有视频生成流程
- **错误处理**：API 统一返回 `{ success: boolean, data?: T, error?: string }`

## 7. 文件变更总览

| 文件 | 操作 | 说明 |
|------|------|------|
| `creator-api/prisma/schema.prisma` | 修改 | 新增 ModelRegistry 表 |
| `creator-api/middleware/admin-auth.js` | 新增 | JWT 认证中间件 |
| `creator-api/routes/admin.js` | 新增 | 管理后台 API 路由 |
| `creator-api/scripts/import-models.js` | 新增 | 模型数据导入脚本 |
| `creator-api/server.js` | 修改 | 注册 /api/admin 路由 |
| `skills/runninghub/model-router.js` | 修改 | 新增 loadFromDB 方法，向后兼容 |
| `shared/admin-config.js` | 新增 | 前后端共享的管理配置常量 |
| `creator-frontend/src/pages/AdminLogin.tsx` | 新增 | 管理员登录页 |
| `creator-frontend/src/pages/admin/AdminDashboard.tsx` | 新增 | 管理后台主框架 |
| `creator-frontend/src/pages/admin/ModelManager.tsx` | 新增 | 模型管理表格 |
| `creator-frontend/src/pages/admin/ModelEditPanel.tsx` | 新增 | 模型编辑滑出面板 |
| `creator-frontend/src/components/layout/AdminSidebar.tsx` | 新增 | 管理后台侧边栏 |
| `creator-frontend/src/services/admin-api.ts` | 新增 | 管理后台 API 请求层 |
| `creator-frontend/src/router.tsx` | 修改 | 新增 /admin/* 路由 |
| `creator-frontend/vite.config.ts` | 修改 | 无需改动，Vite 已代理 /api |

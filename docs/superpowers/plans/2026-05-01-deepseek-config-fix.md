# DeepSeek Provider 配置修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 OpenClaw 容器内 DeepSeek provider 配置的 3 个问题：覆盖写入 bug、硬编码 API Key、容器重启后配置丢失，并补齐 auth profile。

**Architecture:** 修改 3 个文件——`cfg-deepseek.js`（安全合并写入）、`docker-compose.yml`（注入环境变量 + 持久化卷）、`tmp-auth.json`（补齐 deepseek auth profile）。改动小、隔离性好、不涉及运行时架构变更。

**Tech Stack:** Node.js、Docker Compose、JSON

---

## 文件职责映射

| 文件 | 职责 | 改动类型 |
|------|------|----------|
| `scripts/cfg-deepseek.js` | 向 OpenClaw 容器内写入 deepseek provider 配置 | 修改 |
| `deploy/docker-compose.yml` | OpenClaw 服务的运行时环境变量和卷挂载 | 修改 |
| `tmp-auth.json` | OpenClaw auth profiles 配置模板 | 修改 |

---

### Task 1: 修复 cfg-deepseek.js —— 安全合并 + 移除硬编码

**Files:**
- Modify: `scripts/cfg-deepseek.js`（全文件重写，仅 16 行）

- [ ] **Step 1: 替换 cfg-deepseek.js 内容**

将整个文件替换为以下内容：

```javascript
const fs = require('fs');

const cfgPath = '/home/node/.openclaw/openclaw.json';
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error('DEEPSEEK_API_KEY not set');
  process.exit(1);
}

cfg.models = cfg.models || {};
cfg.models.providers = cfg.models.providers || {};
cfg.models.providers.deepseek = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: apiKey,
  models: ['deepseek-chat']
};

cfg.agents = cfg.agents || {};
cfg.agents.defaults = cfg.agents.defaults || {};
cfg.agents.defaults.model = { primary: 'deepseek/deepseek-chat' };

fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
console.log('DeepSeek provider configured successfully');
```

- [ ] **Step 2: 验证语法正确**

在项目根目录运行：

```powershell
node --check scripts/cfg-deepseek.js
```

预期：无输出（无语法错误）

- [ ] **Step 3: 模拟验证不会覆盖其他 providers**

在项目根目录运行：

```powershell
node -e "
const cfg = {models:{providers:{openai:{baseUrl:'https://api.openai.com',apiKey:'sk-test',models:['gpt-4']}}}};
const fs=require('fs');
const os=require('os');
const path=require('path');
const tmp=path.join(os.tmpdir(),'test-openclaw.json');
fs.writeFileSync(tmp,JSON.stringify(cfg));

// simulate cfg-deepseek.js logic
const apiKey='sk-test-ds';
cfg.models.providers.deepseek = {baseUrl:'https://api.deepseek.com',apiKey,models:['deepseek-chat']};
console.log(JSON.stringify(cfg.models.providers,null,2));
fs.unlinkSync(tmp);
"
```

预期：输出同时包含 `openai` 和 `deepseek` 两个 provider，不会覆盖。

- [ ] **Step 4: Commit**

```bash
git add scripts/cfg-deepseek.js
git commit -m "fix: safe-merge deepseek provider config, remove hardcoded API key"
```

---

### Task 2: 补齐 docker-compose.yml —— 环境变量 + 持久化卷

**Files:**
- Modify: `deploy/docker-compose.yml:31-48`（openclaw 服务定义）
- Modify: `deploy/docker-compose.yml:70-72`（volumes 顶层声明）

- [ ] **Step 1: 给 openclaw 服务添加 DEEPSEEK_API_KEY 环境变量 + 持久化卷**

修改 `deploy/docker-compose.yml`，在 openclaw 服务的 `environment:` 块中添加 `DEEPSEEK_API_KEY`，在 `volumes:` 块中添加 openclaw 数据目录挂载。

将第 35-44 行：

```yaml
    environment:
      REDIS_URL: redis://redis:6379
      MQTT_BROKER: mqtt://mosquitto:1883
      MINIO_ENDPOINT: http://minio:9000
      MINIO_BUCKET: avatar-videos
      OPENAI_API_KEY: ${OPENAI_API_KEY:-sk-placeholder}
    volumes:
      - ../skills:/opt/openclaw/skills:ro
      - ../shared:/opt/openclaw/shared:ro
      - ../templates:/opt/openclaw/templates:ro
```

替换为：

```yaml
    environment:
      REDIS_URL: redis://redis:6379
      MQTT_BROKER: mqtt://mosquitto:1883
      MINIO_ENDPOINT: http://minio:9000
      MINIO_BUCKET: avatar-videos
      OPENAI_API_KEY: ${OPENAI_API_KEY:-sk-placeholder}
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY:-}
    volumes:
      - ../skills:/opt/openclaw/skills:ro
      - ../shared:/opt/openclaw/shared:ro
      - ../templates:/opt/openclaw/templates:ro
      - openclaw_data:/home/node/.openclaw
```

将第 70-72 行的 `volumes:` 顶层声明：

```yaml
volumes:
  redis_data:
  minio_data:
```

替换为：

```yaml
volumes:
  redis_data:
  minio_data:
  openclaw_data:
```

- [ ] **Step 2: 验证 docker-compose 配置语法**

在 `deploy/` 目录运行：

```powershell
docker compose -f docker-compose.yml config --quiet
```

预期：退出码 0，无错误输出。如果有警告输出属于正常情况（仅检查配置语法）。

- [ ] **Step 3: Commit**

```bash
git add deploy/docker-compose.yml
git commit -m "feat: add DEEPSEEK_API_KEY env and persistent volume for openclaw config"
```

---

### Task 3: 补齐 tmp-auth.json —— 添加 deepseek auth profile

**Files:**
- Modify: `tmp-auth.json`（全文件，仅 1 行 JSON）

- [ ] **Step 1: 添加 deepseek auth profile**

将 `tmp-auth.json` 的内容从：

```json
{"openai:default":{"provider":"openai","mode":"api_key"}}
```

替换为：

```json
{"openai:default":{"provider":"openai","mode":"api_key"},"deepseek:default":{"provider":"deepseek","mode":"api_key"}}
```

- [ ] **Step 2: 验证 JSON 格式**

在项目根目录运行：

```powershell
node -e "JSON.parse(require('fs').readFileSync('tmp-auth.json','utf8'));console.log('JSON valid')"
```

预期：输出 `JSON valid`

- [ ] **Step 3: Commit**

```bash
git add tmp-auth.json
git commit -m "feat: add deepseek auth profile to tmp-auth.json"
```

---

## 验证清单

完成所有 3 个 Task 后，运行以下验证：

- [ ] **V1: 检查所有修改文件的语法**

```powershell
node --check scripts/cfg-deepseek.js
docker compose -f deploy/docker-compose.yml config --quiet
node -e "JSON.parse(require('fs').readFileSync('tmp-auth.json','utf8'))"
```

预期：全部退出码 0

- [ ] **V2: 确认硬编码 API Key 已被移除**

```powershell
Select-String -Path scripts/cfg-deepseek.js -Pattern 'sk-YOUR-ACTUAL-KEY-REDACTED'
```

预期：无匹配（硬编码 key 已被移除）

- [ ] **V3: 确认 cfg-deepseek.js 使用安全合并而非覆盖**

```powershell
Select-String -Path scripts/cfg-deepseek.js -Pattern 'cfg\.models\s*='
```

预期：无匹配（不再有直接覆盖 `cfg.models` 的语句）

---

## 回滚方案

每个 Task 一个独立 commit，回滚只需 revert 对应 commit：

| 需要回滚的问题 | 回滚命令 |
|---------------|---------|
| Task 1 引起的 OpenClaw 无法启动 | `git revert <commit-hash-1>` |
| Task 2 引起 Docker 编排失败 | `git revert <commit-hash-2>` |
| Task 3 引起 auth 解析错误 | `git revert <commit-hash-3>` |

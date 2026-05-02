# Verification Gate

> 验证门禁：写完代码 → 自动跑验证 → 不通过就修 → 全通过才继续

## 核心规则

每次编辑源代码文件后，必须立即运行验证门禁。**任何一步不通过，就必须停下来修复，不允许标记任务完成或继续下一步。**

```
[编辑代码] → [验证] → 失败？→ [修复] → [重新验证] → 通过 → [继续]
```

## 验证门禁链

按顺序执行，前一步通过才跑下一步：

| 步骤 | 检查内容 | 失败处理 |
|------|---------|---------|
| 1. 语法检查 | 文件能正确解析 | 修复语法错误 |
| 2. 类型检查 | 类型系统无错误 | 修复类型错误 |
| 3. 构建 | 项目能成功构建 | 修复构建错误 |
| 4. 安全扫描 | 无硬编码密钥/console.log | 删除或迁移 |

## 各语言验证命令

### JavaScript / TypeScript 项目

```bash
# 步骤1: 语法检查
node --check <changed-file>.js        # JS 文件
npx tsc --noEmit                      # TS 文件

# 步骤2: 类型检查
npx tsc --noEmit

# 步骤3: 构建
npm run build

# 步骤4: 安全扫描（仅扫描源码，跳过 node_modules）
# 检查硬编码密钥
grep -rn "sk-" --include="*.ts" --include="*.js" src/ | grep -v node_modules
# 检查 console.log（前端）
grep -rn "console\.log" --include="*.ts" --include="*.tsx" src/
```

### Python 项目

```bash
# 步骤1+2: 语法+类型
python -m py_compile <changed-file>.py
pyright . 2>&1 | head -30  # 或 mypy

# 步骤3: 构建/检查
python -m compileall src/
ruff check .

# 步骤4: 安全扫描
bandit -r src/
grep -rn "api_key\|API_KEY\|sk-" --include="*.py" src/
```

### Go 项目

```bash
# 步骤1: 语法+类型
go vet ./...

# 步骤2: 类型检查
go build ./...

# 步骤3: 构建
go build -o /dev/null ./...

# 步骤4: 安全扫描
gosec ./...
grep -rn "sk-" --include="*.go" .
```

### Swift 项目

```bash
# 步骤1+2: 语法+类型
swift build

# 步骤3: 构建
xcodebuild -scheme <scheme> -destination 'platform=iOS Simulator,name=iPhone 16' build

# 步骤4: 安全扫描
grep -rn "sk-\|api_key\|API_KEY" --include="*.swift" .
```

## 安全扫描重点

### 🔴 必须 0 容忍
- 硬编码的 API Key（`sk-`, `api_key`, `API_KEY`, `OPENAI_API_KEY`）
- 硬编码的密码、token、secret
- 在生产代码中的 `console.log` / `print()` 调试语句（服务器启动日志除外）

### 🟡 警告
- `.env` 文件是否在 `.gitignore` 中
- 是否有未使用的敏感配置文件

## 修正流程

当验证失败时：

```
1. 分析错误输出
2. 修复源代码（不修改验证命令）
3. 重新运行验证
4. 重复直到全部通过
5. 报告验证结果
```

## 与 TDD 的关系

- **验证门禁** = 代码写完后的质量检查（语法、类型、构建）
- **TDD** = 代码写之前的正确性保证（先写测试、看到失败、再实现）
- 两者配合：TDD 保证逻辑正确，验证门禁保证工程质量

## 项目管理

- 项目级规则放在 `<project>/.trae/rules/verification-gate.md`
- 此规则在 Trae/Claude Code 中作为 Agent 行为规则自动加载
- 无需每次手动指定，Agent 会自然遵循此门禁流程

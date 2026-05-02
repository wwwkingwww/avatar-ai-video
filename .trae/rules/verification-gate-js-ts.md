# Verification Gate — JavaScript/TypeScript

> 语言专属版本，包含 JS/TS 特有的验证命令细节

## 验证门禁链（JS/TS）

每次编辑 `.js` / `.ts` / `.tsx` 源码后立即执行：

```
步骤1: node --check <changed-files>       # 语法
步骤2: npx tsc --noEmit                   # 类型
步骤3: npm run build                       # 构建（含 tsc + vite/webpack）
步骤4: grep -rn "sk-" src/              # 密钥扫描
       grep -rn "console\.log" src/       # 调试语句
```

## 多模块项目

对每个独立模块分别验证：

```bash
# 前端
cd creator-frontend && npx tsc --noEmit && npm run build

# 后端
cd creator-api && node --check server.js && \
  for f in services/*.js routes/*.js middleware/*.js; do node --check "$f"; done

# 共享模块
cd shared && for f in *.js; do node --check "$f"; done

# Skills
cd skills && find . -name "*.js" -exec node --check {} \;
```

## 单文件快速检查

只改了一个文件时：

```bash
# .ts 文件
npx tsc --noEmit --pretty false 2>&1 | head -5

# .js 文件
node --check path/to/file.js
```

## 安全扫描（JS/TS 专用）

```bash
# 检查 API Key 泄露（仅源码目录）
grep -rn "sk-" --include="*.ts" --include="*.tsx" --include="*.js" src/ | grep -v node_modules

# 检查调试代码残留
grep -rn "console\.log\|debugger" --include="*.ts" --include="*.tsx" src/

# 确认 .env 被 gitignore
grep "\.env" .gitignore
```

# Phantom Success Detector

> **幻影成功检测规则** — AI 代理必须自动遵循

## 什么是幻影成功

幻影成功 = 验证命令跑完了但没有真正检查结果 = 输出说"通过"但实际代码有错。

最常见的 5 种幻影成功形态：

### 类型 1：无退出码检查
```javascript
// ❌ 幻影成功：exit(0) 但内容全是 FAIL
`node test.js`  // 输出 FAIL FAIL FAIL → AI 说 "通过了"

// ✅ 真实验证：检查 exit code
const result = run('node test.js');
if (result.code !== 0) throw new Error('Tests failed');
```

### 类型 2：部分验证冒充全量验证
```
❌ "npm run build 过了，所以全部 OK"
   → 构建通过 ≠ 类型检查通过 ≠ 测试通过 ≠ 安全扫描通过

✅ 必须完整运行 verify-gate.cjs 所有阶段
```

### 类型 3：依赖链断裂
```
❌ 改了 shared/generation-config.js → 只跑了 creator-frontend 的 tsc
   → creator-api 引用了这个文件但没检查

✅ verify-gate.cjs 的 syntax 阶段收集所有项目文件
```

### 类型 4：超时/错误被吞掉
```
❌ try { await test() } catch { /* ignore */ }
   → 测试崩溃了但被 catch 吃掉，AI 看到 exit 0

✅ 每个阶段必须有独立的 try/catch + 明确的 FAIL 标记
```

### 类型 5：构建产物过期
```
❌ 改了源码 → npm run build 用了缓存 → dist/ 里是旧代码
   → AI 看到构建"通过"但产物是旧的

✅ CI 模式使用 npm run build (无缓存) 或检查时间戳
```

## 自动检测规则

AI 代理在以下情况必须自我检查：

### 规则 PSD-1：验证结果必须包含数字证据
```
声明 "构建通过" 时必须附带: exit code, 耗时, 错误计数
声明 "测试通过" 时必须附带: X/Y passed, 0 failures
声明 "检查完成" 时必须附带: 每个阶段的具体数据
```
**违规示例**: "构建通过了" → 没有 exit code，没有错误计数
**合规示例**: "构建通过 (exit 0, 3.2s, 0 errors)"

### 规则 PSD-2：不允许阶段跳过
```
如果 verify-gate.cjs 在某个阶段失败并停止（stopOnFail=true），
后续阶段没有运行，不能声称它们"通过"或"OK"。

必须明确报告：哪些阶段 PASS，哪些阶段 FAIL，哪些阶段 SKIPPED（因为前序失败）
```
**违规示例**: "所有检查通过" → 但 SYNTAX 阶段就失败了，后面全没跑
**合规示例**: "SYNTAX FAIL, TYPES/BUILD/SECURITY/TESTS SKIPPED"

### 规则 PSD-3：日志中的 FAIL 与最终声明矛盾时，以日志为准
```
如果 verify-gate.cjs 的 stdout 中包含 "FAIL" 或 "error" 或 "undefined"，
但 AI 声称 "通过"，这是幻影成功。

规则：日志中出现 FAIL/error → 实际就是 FAIL，不允许翻案。
```

### 规则 PSD-4：验证代理报告优先
```
主 AI 的自我判断 < verify-gate.cjs 的退出码 < verification-agent 的独立报告

如果 verification-agent 报告 FAIL，主 AI 不得向用户声称 PASS。
如果 verify-gate.cjs exit 1，主 AI 不得向用户声称 PASS。
```

### 规则 PSD-5：变更文件必须在检查范围内
```
每次验证前，必须先 git diff --stat 确定变更了哪些文件，
然后确认这些文件对应的检查阶段已经运行且 PASS。

如果改了 .ts 文件但没有运行 tsc → 幻影成功
如果改了 .js 文件但没有运行 node --check → 幻影成功
如果改了 shared/ 但没有同时检查 frontend 和 api → 幻影成功
```

## 与 verification-gate.md 的关系

| 规则文件 | 层级 | 职责 |
|----------|------|------|
| `verification-gate.md` | 操作规范 | 定义验证步骤和命令 |
| `phantom-success-detector.md` | 认知规范 | 定义如何判断验证结果是否真正可信 |
| `verification-agent.md` | 执行层 | 独立运行验证，输出结构化证据 |

三者构成反虚幻成功系统的完整规则链：
```
verification-gate.md → 告诉你跑什么
phantom-success-detector.md → 告诉你判定标准
verification-agent.md → 独立执行 + 提供证据
```

## 自我检查例程

AI 代理在每次声称验证结果前，必须逐条核对：

```
□ PSD-1: 我的声明是否包含具体数字（exit code, 通过/失败计数）？
□ PSD-2: 我是否跳过了某些阶段却声称"全部通过"？
□ PSD-3: 验证输出中是否有 FAIL/error/undefined 与我的结论矛盾？
□ PSD-4: 我是否引用了 verification-agent 的独立报告？
□ PSD-5: 变更的文件是否都在检查范围内？
```

**如果任何一条不能打勾，禁止声称验证通过。**

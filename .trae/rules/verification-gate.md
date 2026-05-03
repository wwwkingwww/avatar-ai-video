# Verification Gate (Project Level)

> 项目级验证门禁规则 — avatar-ai-video

## 统一入口

本项目使用全局验证系统，在任意目录运行：

```bash
node ~/.trae-cn/scripts/verify-gate.cjs
```

或通过 npm 脚本：

```bash
npm run verify          # 全量验证
npm run verify:fast     # 快速模式
npm run verify:init     # 生成/更新配置
```

## 项目配置

- [verify-gate.config.json](../verify-gate.config.json) — 项目扫描范围、构建目标、跳过目录

## 全局系统

- 规则：[phantom-success-detector.md](./phantom-success-detector.md) — 幻影成功检测
- 规则：`~/.trae-cn/rules/phantom-success-detector.md` — 全局幻影成功检测规范
- 代理：`~/.trae-cn/agents/verification-agent.md` — 全局独立验证代理

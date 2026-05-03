# Verification Agent (Project Level)

> 代理到全局 verification-agent：`~/.trae-cn/agents/verification-agent.md`
>
> 项目级只记录项目特定的验证配置和已知例外。
>
> 每次任务完成后，主 AI 必须调用此代理获得独立确认。

## 项目特定信息

- 配置文件：`verify-gate.config.json`
- 前端源码：`creator-frontend/src/`（TypeScript + React）
- 后端源码：`creator-api/`（Node.js）
- 测试脚本：`scripts/full-check.cjs`（需要 API 服务运行在 :3099）

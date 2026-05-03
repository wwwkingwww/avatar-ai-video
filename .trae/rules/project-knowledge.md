# 项目知识库自动查询规则

## 自动触发时机

在以下情况，你必须主动调用 `skills/project-knowledge/index.js query` 查询项目文档：

1. **用户询问架构/设计问题** — "这个怎么设计的"、"架构是什么样的"、"技术选型是什么"
2. **用户要求实现新功能** — 先查 Plan/Spec 文档了解已有设计方案
3. **用户提到某个模块名** — phone-agent、openclaw、runninghub、creator-ui、creator-api
4. **用户问配置/环境** — "怎么配置"、"环境变量"、"部署方式"
5. **用户问排障/调试** — 查 rules 和 docs 中的已知问题

## 查询方式

```bash
# 基本查询
cd skills/project-knowledge && node index.js query "用户问题关键词"

# 按类别过滤
cd skills/project-knowledge && node index.js query --category plan "实现计划"
cd skills/project-knowledge && node index.js query --category spec "设计方案"

# 按标签过滤
cd skills/project-knowledge && node index.js query --tags phone-agent "初始化"
```

## 查询结果使用

- 拿到返回的文档路径后，用 Read 工具阅读具体内容
- 将文档中的设计决策、技术选型、已知限制告知用户
- 开发时严格对照 Plan/Spec 文档，避免偏离设计方向

## 索引维护

如果查询时提示"尚未建立索引"，先执行：

```bash
cd skills/project-knowledge && node scan
```

新写或修改了 .md 文档后，重新索引：

```bash
cd skills/project-knowledge && node scan
```

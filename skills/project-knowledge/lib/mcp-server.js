import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { embed } from './embedder.js';
import { searchGrouped, getStats } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SERVER_NAME = 'project-knowledge';
const SERVER_VERSION = '1.0.0';

const TOOLS = [
  {
    name: 'search_knowledge',
    description: '搜索项目知识库：在所有 MD 文档、PLAN、SPEC、规则文档中进行语义检索。返回最相关的文档和片段。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '自然语言查询，例如："手机代理如何工作"、"视频生成的架构设计"、"配置修复方案"',
        },
        category: {
          type: 'string',
          description: '过滤文档类型: plan(实现计划), spec(设计规格), rule(开发规则), docs(项目文档), skill(Skill文档)',
          enum: ['plan', 'spec', 'rule', 'docs', 'skill'],
        },
        tags: {
          type: 'string',
          description: '逗号分隔的标签过滤: phone-agent, openclaw, runninghub, creator-ui, creator-api, video-gen, integration, architecture',
        },
        topK: {
          type: 'number',
          description: '返回结果数量，默认 5',
          default: 5,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_knowledge_stats',
    description: '获取知识库索引统计信息：已索引文档数、类别分布、标签分布',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

function createResponse(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function createError(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleSearchKnowledge(args) {
  const query = args.query;
  if (!query) {
    return { error: '缺少 query 参数' };
  }

  const stats = getStats();
  if (!stats.indexed) {
    return {
      error: '知识库尚未索引。请在项目根目录运行: cd skills/project-knowledge && npm run scan',
    };
  }

  const options = {
    topK: args.topK || 5,
    minScore: 0.15,
    filterCategory: args.category || null,
    filterTags: args.tags ? args.tags.split(',').map((t) => t.trim()) : null,
  };

  const queryVector = await embed(query);
  const result = searchGrouped(query, queryVector, options);

  const items = result.results.map((r) => ({
    path: r.path,
    category: r.category,
    title: r.title,
    date: r.date || '未知',
    relevance: Math.round(r.bestScore * 100),
    tags: r.tags || [],
    topChunks: r.topChunks.map((c) => ({
      heading: c.headingPath,
      preview: c.content ? c.content.slice(0, 300) : '(请查看源文件)',
    })),
  }));

  return {
    query,
    totalDocs: result.totalDocs,
    results: items,
    hint: '使用 read_file 工具查看完整文档内容。路径相对于项目根目录。',
  };
}

function handleGetStats() {
  const stats = getStats();
  return stats;
}

async function handleToolCall(name, args) {
  switch (name) {
    case 'search_knowledge':
      return await handleSearchKnowledge(args);
    case 'get_knowledge_stats':
      return handleGetStats();
    default:
      return { error: `未知工具: ${name}` };
  }
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  let buffer = '';

  rl.on('line', async (line) => {
    buffer += line;

    let parsed;
    try {
      parsed = JSON.parse(buffer);
      buffer = '';
    } catch {
      return;
    }

    const { method, params, id } = parsed;

    try {
      switch (method) {
        case 'initialize':
          process.stdout.write(
            createResponse(id, {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            }) + '\n',
          );
          break;

        case 'notifications/initialized':
          break;

        case 'tools/list':
          process.stdout.write(createResponse(id, { tools: TOOLS }) + '\n');
          break;

        case 'tools/call': {
          const result = await handleToolCall(params.name, params.arguments || {});
          const content = {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          };
          process.stdout.write(createResponse(id, { content: [content] }) + '\n');
          break;
        }

        case 'ping':
          process.stdout.write(createResponse(id, {}) + '\n');
          break;

        default:
          process.stdout.write(createError(id, -32601, `Method not found: ${method}`) + '\n');
      }
    } catch (err) {
      process.stdout.write(createError(id, -32603, err.message) + '\n');
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('MCP Server fatal error:', err);
  process.exit(1);
});

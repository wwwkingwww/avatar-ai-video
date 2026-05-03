#!/usr/bin/env node

import { scanDocuments, summarizeDocument } from './lib/scanner.js';
import { chunkDocument } from './lib/chunker.js';
import { embedBatch } from './lib/embedder.js';
import { saveChunks, saveVectors, saveMeta, searchGrouped, getStats, clearIndex } from './lib/store.js';
import { watch } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = new URL('.', import.meta.url).pathname;
const PROJECT_ROOT = join(__dirname, '..', '..', '..');

const COMMANDS = {
  scan: '扫描项目所有 .md 文档并建立向量索引',
  'scan --watch': '启动监听模式，文档变更时自动重索引',
  query: '查询知识库 <query text>',
  stats: '查看索引统计信息',
  clear: '清除索引数据',
  serve: '启动 MCP Server (IDE 集成)',
};

function printHelp() {
  console.log('\n📚 项目知识库 - Project Knowledge');
  console.log('================================\n');
  console.log('用法: node index.js <command> [args]\n');
  console.log('命令:');
  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    console.log(`  ${cmd.padEnd(12)} ${desc}`);
  }
  console.log('\n示例:');
  console.log('  node index.js scan');
  console.log('  node index.js query "手机代理怎么工作的"');
  console.log('  node index.js query --category plan "视频生成"');
  console.log('  node index.js query --tags phone-agent,integration "消息队列"');
  console.log('  node index.js stats');
  console.log('  node index.js serve');
  console.log('');
}

function parseQueryArgs(args) {
  const options = {};
  const queryParts = [];

  let i = 0;
  while (i < args.length) {
    if (args[i] === '--category' && i + 1 < args.length) {
      options.filterCategory = args[i + 1];
      i += 2;
    } else if (args[i] === '--tags' && i + 1 < args.length) {
      options.filterTags = args[i + 1].split(',').map((t) => t.trim());
      i += 2;
    } else if (args[i] === '--after' && i + 1 < args.length) {
      options.filterDateAfter = args[i + 1];
      i += 2;
    } else if (args[i] === '--before' && i + 1 < args.length) {
      options.filterDateBefore = args[i + 1];
      i += 2;
    } else if (args[i] === '--top' && i + 1 < args.length) {
      options.topK = parseInt(args[i + 1]);
      i += 2;
    } else {
      queryParts.push(args[i]);
      i++;
    }
  }

  return { query: queryParts.join(' '), options };
}

function formatSearchResults(result) {
  if (!result.results || result.results.length === 0) {
    console.log('\n❌ 未找到相关文档。');
    console.log('   提示：尝试使用更通用的关键词，或先运行 `node index.js scan` 建立索引。\n');
    return;
  }

  console.log(`\n🔍 查询: "${result.query}"`);
  console.log(`📊 找到 ${result.results.length} 个相关文档 (共 ${result.totalDocs} 个文档索引)\n`);

  const categoryIcons = {
    plan: '📋',
    spec: '📐',
    rule: '📏',
    docs: '📄',
    root: '📌',
    skill: '🔧',
    readme: '📖',
  };

  const categoryNames = {
    plan: '实现计划',
    spec: '设计规格',
    rule: '开发规则',
    docs: '项目文档',
    root: '根目录文档',
    skill: 'Skill 文档',
    readme: '说明文档',
  };

  for (let i = 0; i < result.results.length; i++) {
    const r = result.results[i];
    const icon = categoryIcons[r.category] || '📄';
    const catName = categoryNames[r.category] || r.category;
    const scoreBar = '█'.repeat(Math.round(r.bestScore * 10)) + '░'.repeat(10 - Math.round(r.bestScore * 10));

    console.log(`${i + 1}. ${icon} [${catName}] ${r.title}`);
    console.log(`   相关度: ${scoreBar} ${(r.bestScore * 100).toFixed(0)}%`);
    console.log(`   路径: ${r.path}`);
    if (r.date) console.log(`   日期: ${r.date}`);
    if (r.tags && r.tags.length > 0) console.log(`   标签: ${r.tags.join(', ')}`);
    if (r.matchCount) console.log(`   匹配片段: ${r.matchCount}`);

    for (const chunk of r.topChunks) {
      const preview = chunk.content
        ? chunk.content.replace(/\n/g, ' ').slice(0, 120) + '...'
        : '(匹配片段)';
      console.log(`   └─ ${chunk.headingPath}`);
      console.log(`      ${preview}`);
    }

    console.log('');
  }
}

async function cmdScan() {
  console.log('\n🔍 正在扫描项目文档...\n');

  const docs = await scanDocuments();
  console.log(`📄 发现 ${docs.length} 个文档\n`);

  if (docs.length === 0) {
    console.log('⚠️  未发现任何 .md 文档。\n');
    return;
  }

  const allChunks = [];
  for (const doc of docs) {
    const categoryIcons = {
      plan: '📋', spec: '📐', rule: '📏', docs: '📄', root: '📌', skill: '🔧',
    };
    const icon = categoryIcons[doc.category] || '📄';
    console.log(`  ${icon} [${doc.category}] ${doc.title}`);

    const chunks = chunkDocument(doc);
    allChunks.push(...chunks);
  }

  console.log(`\n✂️  拆分为 ${allChunks.length} 个语义片段\n`);

  console.log('🧠 正在生成向量嵌入...');
  const texts = allChunks.map((c) => `${c.headingPath}\n${c.content}`);
  const vectors = await embedBatch(texts, (done, total) => {
    if (done % 10 === 0 || done === total) {
      process.stdout.write(`\r  进度: ${done}/${total} (${((done / total) * 100).toFixed(0)}%)`);
    }
  });
  console.log('');

  saveChunks(allChunks);
  saveVectors(vectors);
  saveMeta({
    indexedAt: new Date().toISOString(),
    modelUsed: 'all-MiniLM-L6-v2',
    totalDocs: docs.length,
    totalChunks: allChunks.length,
    documents: docs.map(summarizeDocument),
  });

  console.log(`\n✅ 索引完成!`);
  console.log(`   ${docs.length} 个文档 → ${allChunks.length} 个向量片段\n`);
  console.log('💡 现在可以运行: node index.js query "你的问题"\n');
}

async function cmdQuery(queryText, options = {}) {
  if (!queryText) {
    console.log('\n❌ 请提供查询文本。');
    console.log('   用法: node index.js query "你的问题"\n');
    return;
  }

  const stats = getStats();
  if (!stats.indexed) {
    console.log('\n⚠️  尚未建立索引。请先运行: node index.js scan\n');
    return;
  }

  const { embed } = await import('./lib/embedder.js');
  console.log('\n🧠 正在编码查询...');
  const queryVector = await embed(queryText);
  console.log('🔍 正在搜索...');

  const result = searchGrouped(queryText, queryVector, options);
  formatSearchResults(result);
}

async function cmdStats() {
  const stats = getStats();

  if (!stats.indexed) {
    console.log('\n⚠️  尚未建立索引。请先运行: node index.js scan\n');
    return;
  }

  console.log('\n📊 索引统计');
  console.log('============\n');
  console.log(`  文档总数: ${stats.totalDocs}`);
  console.log(`  向量片段: ${stats.totalChunks}`);
  console.log(`  索引时间: ${stats.lastIndexed}`);
  console.log(`  嵌入模型: ${stats.modelUsed}`);
  console.log('\n  按类别分布:');
  const categoryNames = {
    plan: '实现计划', spec: '设计规格', rule: '开发规则',
    docs: '项目文档', root: '根目录文档', skill: 'Skill 文档',
  };
  for (const [cat, count] of Object.entries(stats.byCategory)) {
    const name = categoryNames[cat] || cat;
    console.log(`    ${name.padEnd(14)} ${count} 个片段`);
  }

  if (Object.keys(stats.byTag).length > 0) {
    console.log('\n  标签分布 (Top 10):');
    const sortedTags = Object.entries(stats.byTag).sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [tag, count] of sortedTags) {
      console.log(`    ${tag.padEnd(20)} ${count} 个片段`);
    }
  }
  console.log('');
}

async function cmdClear() {
  clearIndex();
  console.log('\n🗑️  索引数据已清除。\n');
}

function cmdWatch() {
  const watchDirs = [
    join(PROJECT_ROOT, 'docs'),
    join(PROJECT_ROOT, '.trae', 'rules'),
    PROJECT_ROOT,
  ];

  console.log('\n👁️  监听模式已启动 — 文档变更时自动重索引\n');
  console.log('   监听目录:');
  watchDirs.forEach((d) => console.log(`   - ${d}`));
  console.log('\n   按 Ctrl+C 停止\n');

  let debounceTimer = null;

  function scheduleRebuild(filePath) {
    if (!filePath.endsWith('.md')) return;
    if (filePath.includes('node_modules')) return;
    if (filePath.includes('skills\\project-knowledge')) return;
    if (filePath.includes('skills/project-knowledge')) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      console.log(`\n📝 检测到文档变更: ${filePath}`);
      console.log('🔄 正在重建索引...\n');
      try {
        const docs = await scanDocuments();
        const allChunks = [];
        for (const doc of docs) {
          allChunks.push(...chunkDocument(doc));
        }
        const texts = allChunks.map((c) => `${c.headingPath}\n${c.content}`);
        const vectors = await embedBatch(texts);
        saveChunks(allChunks);
        saveVectors(vectors);
        saveMeta({
          indexedAt: new Date().toISOString(),
          modelUsed: 'all-MiniLM-L6-v2',
          totalDocs: docs.length,
          totalChunks: allChunks.length,
          documents: docs.map(summarizeDocument),
        });
        console.log(`✅ 索引已更新: ${docs.length} 文档, ${allChunks.length} 片段\n`);
      } catch (err) {
        console.error(`❌ 重建索引失败: ${err.message}\n`);
      }
    }, 3000);
  }

  watchDirs.forEach((dir) => {
    try {
      watch(dir, { recursive: true }, (eventType, filename) => {
        if (filename) {
          scheduleRebuild(join(dir, filename));
        }
      });
    } catch {
      // 目录可能不存在，跳过
    }
  });

  process.stdin.resume();
}

async function cmdServe() {
  console.log('\n🚀 启动 MCP Server...\n');
  try {
    await import('./lib/mcp-server.js');
  } catch (err) {
    console.error('MCP Server 启动失败:', err.message);
    console.log('请确保已安装 @modelcontextprotocol/sdk 依赖\n');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  switch (command) {
    case 'scan': {
      const watchMode = args.includes('--watch');
      if (watchMode) {
        await cmdScan();
        cmdWatch();
      } else {
        await cmdScan();
      }
      break;
    }

    case 'query': {
      const { query, options } = parseQueryArgs(args.slice(1));
      await cmdQuery(query, options);
      break;
    }

    case 'stats':
      await cmdStats();
      break;

    case 'clear':
      await cmdClear();
      break;

    case 'serve':
      await cmdServe();
      break;

    default:
      console.log(`\n❌ 未知命令: ${command}`);
      printHelp();
  }
}

main().catch((err) => {
  console.error('\n❌ 错误:', err.message);
  console.error(err.stack);
  process.exit(1);
});

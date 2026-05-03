import { readFileSync, statSync } from 'fs';
import { readFile, readdir, stat } from 'fs/promises';
import { join, relative, basename, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROJECT_ROOT = join(__dirname, '..', '..', '..');

const SCAN_PATTERNS = [
  { glob: 'docs/superpowers/plans/*.md', category: 'plan' },
  { glob: 'docs/superpowers/specs/*.md', category: 'spec' },
  { glob: '.trae/rules/*.md', category: 'rule' },
  { glob: 'docs/*.md', category: 'docs' },
  { glob: 'skills/**/*.md', category: 'skill', ignore: ['skills/project-knowledge/**'] },
  { glob: '*.md', category: 'root' },
];

function extractDateFromFilename(filename) {
  const match = basename(filename, '.md').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function extractTopic(filename) {
  const name = basename(filename, '.md');
  let topic = name.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  topic = topic.replace(/-design$/, '');
  topic = topic.replace(/-/g, ' ');
  if (!topic) topic = name;
  return topic;
}

function extractTitle(content) {
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();

  const h2 = content.match(/^##\s+(.+)$/m);
  if (h2) return h2[1].trim();

  return null;
}

function extractPhase(content) {
  const phaseMatch = content.match(/Phase\s+(\d+)[：:]\s*(.+)/);
  if (phaseMatch) {
    return { number: parseInt(phaseMatch[1]), title: phaseMatch[2].trim() };
  }
  return null;
}

function extractTechStack(content) {
  const techMatch = content.match(/\*\*Tech Stack[：:]\*\*\s*(.+)/);
  if (techMatch) return techMatch[1].trim();
  return null;
}

function extractGoal(content) {
  const goalMatch = content.match(/\*\*Goal[：:]\*\*\s*(.+)/);
  if (goalMatch) return goalMatch[1].trim();
  return null;
}

function extractTags(content, filename) {
  const tags = new Set();
  const lower = content.toLowerCase();
  const keywords = {
    'phone-agent': ['phone-agent', 'phone agent', '手机代理', 'adb', 'accessibility'],
    'openclaw': ['openclaw', 'open claw'],
    'runninghub': ['runninghub', 'running hub', 'rh-v2'],
    'creator-ui': ['creator-ui', 'creator ui', 'frontend', '前端', 'react'],
    'creator-api': ['creator-api', 'creator api', 'backend', '后端', 'express'],
    'video-gen': ['视频生成', 'video generation', 'text-to-video', 'image-to-video'],
    'integration': ['integration', '集成', '接入'],
    'architecture': ['architecture', '架构', '设计'],
    'config': ['config', '配置', 'fix'],
    'deployment': ['deployment', '部署', 'docker'],
    'testing': ['testing', '测试', 'e2e'],
  };

  for (const [tag, patterns] of Object.entries(keywords)) {
    for (const pattern of patterns) {
      if (lower.includes(pattern) || filename.toLowerCase().includes(pattern)) {
        tags.add(tag);
        break;
      }
    }
  }

  return [...tags];
}

function resolveGlobPath(baseDir, globPattern) {
  const parts = globPattern.split('/');
  const lastIdx = parts.length - 1;
  return {
    searchDir: parts.slice(0, lastIdx).join('/') || '.',
    filenamePattern: parts[lastIdx],
  };
}

function shouldExcludePath(entryPath, baseDir) {
  const rel = relative(baseDir, entryPath).replace(/\\/g, '/');
  const excludeDirs = ['node_modules', '.git', 'data', 'dist', 'build', '__pycache__', '.next'];
  return excludeDirs.some((dir) => {
    const pattern = '/' + dir + '/';
    const startsWith = dir + '/';
    const endsWith = '/' + dir;
    return rel.includes(pattern) || rel.startsWith(startsWith) || rel.endsWith(endsWith);
  });
}

async function scanDirectory(baseDir, searchDir, filenamePattern) {
  const results = [];
  const fullDir = join(baseDir, searchDir);

  let entries;
  try {
    entries = await readdir(fullDir, { withFileTypes: true, recursive: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (ext !== '.md') continue;

    const entryPath = join(entry.parentPath || fullDir, entry.name);
    const relPath = relative(baseDir, entryPath);

    if (shouldExcludePath(entryPath, baseDir)) continue;

    const filename = basename(entry.name);

    if (filenamePattern !== '*.md') {
      const regex = new RegExp('^' + filenamePattern.replace('.', '\\.').replace('*', '.*') + '$');
      if (!regex.test(filename)) continue;
    }

    results.push(relPath);
  }

  return results;
}

function shouldIgnore(filePath, ignorePatterns) {
  return ignorePatterns.some((pattern) => filePath.includes(pattern));
}

async function scanDocuments() {
  const allDocs = [];
  const seen = new Set();

  for (const pattern of SCAN_PATTERNS) {
    const { searchDir, filenamePattern } = resolveGlobPath(PROJECT_ROOT, pattern.glob);
    const foundFiles = await scanDirectory(PROJECT_ROOT, searchDir, filenamePattern);

    for (const filePath of foundFiles) {
      if (seen.has(filePath)) continue;
      if (pattern.ignore && shouldIgnore(filePath, pattern.ignore)) continue;
      seen.add(filePath);

      const fullPath = join(PROJECT_ROOT, filePath);
      let content;
      try {
        content = readFileSync(fullPath, 'utf-8');
      } catch {
        continue;
      }

      const stats = statSync(fullPath);
      const title = extractTitle(content);
      const date = extractDateFromFilename(filePath);
      const topic = extractTopic(filePath);
      const phase = extractPhase(content);
      const techStack = extractTechStack(content);
      const goal = extractGoal(content);
      const tags = extractTags(content, filePath);

      const doc = {
        path: filePath,
        category: pattern.category,
        title: title || topic,
        topic,
        date,
        phase,
        goal,
        techStack,
        tags,
        content,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      };

      allDocs.push(doc);
    }
  }

  return allDocs;
}

function summarizeDocument(doc) {
  return {
    path: doc.path,
    category: doc.category,
    title: doc.title,
    topic: doc.topic,
    date: doc.date,
    phase: doc.phase,
    goal: doc.goal,
    techStack: doc.techStack,
    tags: doc.tags,
    sizeBytes: doc.sizeBytes,
    modifiedAt: doc.modifiedAt,
  };
}

export { scanDocuments, summarizeDocument, PROJECT_ROOT };

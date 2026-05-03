import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const CHUNKS_FILE = join(DATA_DIR, 'chunks.json');
const VECTORS_FILE = join(DATA_DIR, 'vectors.json');
const META_FILE = join(DATA_DIR, 'meta.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function saveChunks(chunks) {
  ensureDataDir();
  writeFileSync(CHUNKS_FILE, JSON.stringify(chunks, null, 2), 'utf-8');
}

function loadChunks() {
  if (!existsSync(CHUNKS_FILE)) return [];
  return JSON.parse(readFileSync(CHUNKS_FILE, 'utf-8'));
}

function saveVectors(vectors) {
  ensureDataDir();
  writeFileSync(VECTORS_FILE, JSON.stringify(vectors), 'utf-8');
}

function loadVectors() {
  if (!existsSync(VECTORS_FILE)) return [];
  return JSON.parse(readFileSync(VECTORS_FILE, 'utf-8'));
}

function saveMeta(meta) {
  ensureDataDir();
  writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

function loadMeta() {
  if (!existsSync(META_FILE)) return null;
  return JSON.parse(readFileSync(META_FILE, 'utf-8'));
}

function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function bm25Score(query, text, docFreq, totalDocs, avgDocLen) {
  const k1 = 1.5;
  const b = 0.75;
  const queryTerms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 1);

  const textLower = text.toLowerCase();
  const docLen = text.split(/\W+/).length;
  let score = 0;

  for (const term of queryTerms) {
    const termFreq = (textLower.match(new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi')) || []).length;
    if (termFreq === 0) continue;

    const df = docFreq[term] || 1;
    const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
    const tfNorm =
      (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + b * (docLen / Math.max(avgDocLen, 1))));

    score += idf * tfNorm;
  }

  return score;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function computeDocFreq(chunks) {
  const docFreq = {};
  for (const chunk of chunks) {
    const terms = new Set(chunk.content.toLowerCase().split(/\W+/).filter((t) => t.length > 1));
    for (const term of terms) {
      docFreq[term] = (docFreq[term] || 0) + 1;
    }
  }
  return docFreq;
}

function computeAvgDocLen(chunks) {
  if (chunks.length === 0) return 1;
  const totalLen = chunks.reduce((sum, c) => sum + c.content.split(/\W+/).length, 0);
  return totalLen / chunks.length;
}

function search(query, queryVector, options = {}) {
  const {
    topK = 10,
    minScore = 0.2,
    filterCategory = null,
    filterDateAfter = null,
    filterDateBefore = null,
    filterTags = null,
    includeContent = false,
  } = options;

  const chunks = loadChunks();
  const vectors = loadVectors();

  if (chunks.length === 0) {
    return { results: [], totalChunks: 0 };
  }

  const docFreq = computeDocFreq(chunks);
  const avgDocLen = computeAvgDocLen(chunks);

  const scored = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (filterCategory && chunk.docCategory !== filterCategory) continue;
    if (filterDateAfter && chunk.docDate && chunk.docDate < filterDateAfter) continue;
    if (filterDateBefore && chunk.docDate && chunk.docDate > filterDateBefore) continue;
    if (filterTags && filterTags.length > 0) {
      const chunkTags = chunk.docTags || [];
      if (!filterTags.some((t) => chunkTags.includes(t))) continue;
    }

    const vectorScore = vectors[i] ? cosineSimilarity(queryVector, vectors[i]) : 0;
    const keywordScore = bm25Score(query, chunk.content, docFreq, chunks.length, avgDocLen);

    const keywordWeight = 0.4;
    const vectorWeight = 0.6;
    const hybridScore =
      vectorWeight * vectorScore + keywordWeight * Math.min(keywordScore / 10, 1.0);

    if (hybridScore >= minScore) {
      scored.push({
        ...chunk,
        score: hybridScore,
        vectorScore,
        keywordScore,
        content: includeContent ? chunk.content : undefined,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const topResults = scored.slice(0, topK);

  return {
    results: topResults,
    totalChunks: chunks.length,
    searchedChunks: chunks.length,
    query,
  };
}

function searchGrouped(query, queryVector, options = {}) {
  const { topK = 5, minScore = 0.15 } = options;
  const raw = search(query, queryVector, { ...options, topK: topK * 3, minScore });

  const byDoc = {};
  for (const r of raw.results) {
    if (!byDoc[r.docPath]) {
      byDoc[r.docPath] = {
        path: r.docPath,
        category: r.docCategory,
        title: r.docTitle,
        topic: r.docTopic,
        date: r.docDate,
        tags: r.docTags,
        bestScore: r.score,
        matchCount: 0,
        topChunks: [],
      };
    }

    const group = byDoc[r.docPath];
    group.matchCount++;
    group.bestScore = Math.max(group.bestScore, r.score);

    if (group.topChunks.length < 3) {
      group.topChunks.push({
        headingPath: r.headingPath,
        content: r.content ? r.content.slice(0, 300) : undefined,
        score: r.score,
      });
    }
  }

  const groups = Object.values(byDoc);
  groups.sort((a, b) => b.bestScore - a.bestScore);

  return {
    results: groups.slice(0, topK),
    totalDocs: Object.keys(byDoc).length,
    query,
  };
}

function getStats() {
  const chunks = loadChunks();
  const meta = loadMeta();

  if (chunks.length === 0) {
    return { indexed: false, totalChunks: 0, totalDocs: 0 };
  }

  const docs = new Set(chunks.map((c) => c.docPath));
  const byCategory = {};
  const byTag = {};

  for (const chunk of chunks) {
    byCategory[chunk.docCategory] = (byCategory[chunk.docCategory] || 0) + 1;
    for (const tag of chunk.docTags || []) {
      byTag[tag] = (byTag[tag] || 0) + 1;
    }
  }

  return {
    indexed: true,
    totalChunks: chunks.length,
    totalDocs: docs.size,
    byCategory,
    byTag,
    lastIndexed: meta?.indexedAt || null,
    modelUsed: meta?.modelUsed || 'unknown',
  };
}

function clearIndex() {
  ensureDataDir();
  writeFileSync(CHUNKS_FILE, '[]', 'utf-8');
  writeFileSync(VECTORS_FILE, '[]', 'utf-8');
  saveMeta({ clearedAt: new Date().toISOString() });
}

export {
  saveChunks,
  loadChunks,
  saveVectors,
  loadVectors,
  saveMeta,
  loadMeta,
  search,
  searchGrouped,
  getStats,
  clearIndex,
};

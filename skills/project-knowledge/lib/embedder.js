let pipeline = null;
let modelLoaded = false;
let loadError = null;

const EMBEDDING_DIM = 384;

async function loadModel() {
  if (modelLoaded) return true;
  if (loadError) return false;

  const { pipeline: transformersPipeline, env } = await import('@xenova/transformers');

  if (process.env.HF_ENDPOINT) {
    env.remoteHost = process.env.HF_ENDPOINT;
  }
  env.remotePathTemplate = '{model}/resolve/{revision}/';

  const hosts = [env.remoteHost].filter(Boolean);
  if (!process.env.HF_ENDPOINT) {
    hosts.push('https://hf-mirror.com', 'https://huggingface.co');
  }

  for (const host of hosts) {
    try {
      env.remoteHost = host;
      pipeline = await transformersPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        quantized: true,
      });
      modelLoaded = true;
      console.log(`[embedder] 本地嵌入模型已加载 (all-MiniLM-L6-v2, 384d) [via ${host}]`);
      return true;
    } catch (err) {
      if (host === hosts[hosts.length - 1]) {
        loadError = err;
        console.error('[embedder] 所有镜像源均失败，将使用关键词匹配模式作为回退方案');
      }
    }
  }

  return false;
}

function tokenizeChinese(text) {
  const tokens = [];
  for (let i = 0; i < text.length - 1; i++) {
    tokens.push(text.slice(i, i + 2));
  }
  if (text.length === 1) tokens.push(text);
  return tokens;
}

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

function generateKeywordVector(text) {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
    'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
    'too', 'very', 'just', 'because', 'about', 'what', 'which', 'who',
    'whom', 'this', 'that', 'these', 'those', '它', '的', '了', '在',
    '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
    '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
    '没有', '看', '好', '自己', '这', '他', '她', '们', '那',
    '怎么', '什么', '哪个', '为什么', '可以', '能够', '应该',
    '这个', '那个', '如何', '已经', '如果', '虽然', '但是',
    '因为', '所以', '而且', '或者', '还是', '以及', '关于',
    '通过', '对于', '根据', '按照', '为了', '除了', '作为',
  ]);

  const lower = text.toLowerCase();
  let words;

  if (hasChinese(lower)) {
    const chineseTokens = tokenizeChinese(lower.replace(/[^\u4e00-\u9fff]/g, ''));
    const englishTokens = lower
      .replace(/[\u4e00-\u9fff]+/g, ' ')
      .split(/\W+/)
      .filter((w) => w.length > 1);
    words = [...chineseTokens, ...englishTokens].filter((w) => w.length > 1 && !stopWords.has(w));
  } else {
    words = lower.split(/\W+/).filter((w) => w.length > 1 && !stopWords.has(w));
  }
  const freq = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }

  const vector = new Array(EMBEDDING_DIM).fill(0);
  let idx = 0;
  for (const [word, count] of Object.entries(freq)) {
    const hash = simpleHash(word);
    for (let i = 0; i < Math.min(count, 3); i++) {
      vector[(hash + i * 127) % EMBEDDING_DIM] += 1.0 / Math.sqrt(count);
    }
  }

  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= norm;
    }
  }

  return vector;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

async function embed(text) {
  if (!modelLoaded) {
    const loaded = await loadModel();
    if (!loaded) {
      return generateKeywordVector(text);
    }
  }

  try {
    const result = await pipeline(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
  } catch (err) {
    console.error('[embedder] 嵌入失败，使用关键词回退:', err.message);
    return generateKeywordVector(text);
  }
}

async function embedBatch(texts, onProgress) {
  const vectors = [];

  if (!modelLoaded) {
    const loaded = await loadModel();
    if (!loaded) {
      for (let i = 0; i < texts.length; i++) {
        vectors.push(generateKeywordVector(texts[i]));
        if (onProgress) onProgress(i + 1, texts.length);
      }
      return vectors;
    }
  }

  const batchSize = 32;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    try {
      for (const text of batch) {
        const result = await pipeline(text, { pooling: 'mean', normalize: true });
        vectors.push(Array.from(result.data));
      }
    } catch (err) {
      console.error(`[embedder] 批次嵌入失败 (${i}-${i + batchSize}):`, err.message);
      for (const text of batch) {
        vectors.push(generateKeywordVector(text));
      }
    }
    if (onProgress) onProgress(Math.min(i + batchSize, texts.length), texts.length);
  }

  return vectors;
}

function getEmbeddingDim() {
  return EMBEDDING_DIM;
}

export { embed, embedBatch, loadModel, getEmbeddingDim };

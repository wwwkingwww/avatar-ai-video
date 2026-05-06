import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import prisma from '../prisma/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const REGISTRY_PATHS = [
  join(__dirname, '../../skills/runninghub/developer-kit/models_registry.json'),
  join(__dirname, '../../skills/runninghub/developer-kit/developer-kit/model-registry.public.json'),
];

const OUTPUT_TO_TASK_TYPE = {
  video: 'text-to-video',
  image: 'text-to-image',
  audio: 'text-to-audio',
  '3d': 'text-to-3d',
  string: 'text-gen',
};

function inferInputTypes(params) {
  const types = new Set();
  for (const p of params || []) {
    if (p.type === 'IMAGE') types.add('image');
    if (p.type === 'VIDEO') types.add('video');
    if (p.type === 'AUDIO') types.add('audio');
  }
  return [...types];
}

function inferTaskType(outputType, inputTypes) {
  const base = OUTPUT_TO_TASK_TYPE[outputType] || 'text-to-video';
  if (inputTypes.includes('video') && outputType === 'video') return 'video-to-video';
  if (inputTypes.includes('image') && outputType === 'video') return 'image-to-video';
  if (inputTypes.includes('image') && outputType === 'image') return 'image-to-image';
  if (inputTypes.includes('text') && outputType === 'image') return 'text-to-image';
  if (inputTypes.includes('video') && outputType === 'image') return 'video-to-image';
  if (inputTypes.includes('audio') && outputType === 'video') return 'audio-to-video';
  return base;
}

async function importModels() {
  let sourcePath = null;
  let rawData = null;

  for (const p of REGISTRY_PATHS) {
    if (existsSync(p)) {
      sourcePath = p;
      rawData = JSON.parse(readFileSync(p, 'utf-8'));
      break;
    }
  }

  if (!rawData) {
    process.stderr.write('[import-models] No registry file found.\n');
    return;
  }

  const models = Array.isArray(rawData) ? rawData : (rawData.models || []);
  process.stderr.write(`[import-models] Found ${models.length} models in ${sourcePath}\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const m of models) {
    if (!m.endpoint) {
      skipped++;
      continue;
    }

    const inputTypes = inferInputTypes(m.params);
    const taskType = inferTaskType(m.output_type, inputTypes);

    try {
      const existing = await prisma.modelRegistry.findUnique({
        where: { endpoint: m.endpoint },
      });

      const data = {
        endpoint: m.endpoint,
        nameCn: m.name_cn || m.display_name || '',
        nameEn: m.name_en || '',
        category: m.category || '',
        taskType,
        outputType: m.output_type || '',
        inputTypes,
        params: m.params || [],
        className: m.class_name || '',
      };

      if (existing) {
        await prisma.modelRegistry.update({
          where: { endpoint: m.endpoint },
          data,
        });
        updated++;
      } else {
        await prisma.modelRegistry.create({ data });
        created++;
      }
    } catch (err) {
      console.error(`[import-models] Error importing ${m.endpoint}:`, err.message);
      skipped++;
    }
  }

  process.stderr.write(`[import-models] Done: ${created} created, ${updated} updated, ${skipped} skipped\n`);
  process.stderr.write(`[import-models] Total in database: ${await prisma.modelRegistry.count()}\n`);
}

importModels()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('[import-models] Fatal error:', err);
    process.exit(1);
  });

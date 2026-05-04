import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY_PATH = join(__dirname, 'developer-kit', 'developer-kit', 'model-registry.public.json');
const DEFAULT_PRICING_PATH = join(__dirname, 'developer-kit', 'developer-kit', 'pricing.public.json');

const OUTPUT_TO_TASK_TYPE = {
  'video': 'text-to-video',
  'image': 'text-to-image',
  'audio': 'text-to-audio',
  '3d': 'text-to-3d',
  'string': 'text-gen',
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
  if (inputTypes.includes('video') && outputType === 'image') return 'video-to-image';
  if (inputTypes.includes('audio') && outputType === 'video') return 'audio-to-video';
  return base;
}

function normalizeField(p) {
  let dv = p.defaultValue !== undefined ? String(p.defaultValue) : '';
  if (!dv && (p.type === 'LIST' || p.type === 'ENUM') && Array.isArray(p.options) && p.options.length > 0) {
    dv = String(p.options[0].value ?? p.options[0]);
  }
  return {
    nodeId: p.fieldKey,
    nodeName: p.label || p.fieldKey,
    fieldName: p.fieldKey,
    fieldValue: dv,
    fieldType: p.type,
    fieldData: p.options || null,
    description: p.description || p.label || p.fieldKey,
    required: p.required || false,
  };
}

export class ModelRouter {
  constructor(registryPath = DEFAULT_REGISTRY_PATH, pricingPath = DEFAULT_PRICING_PATH) {
    this.registryPath = registryPath;
    this.pricingPath = pricingPath;
    this.models = [];
    this.pricing = {};
    this.loaded = false;
  }

  loadRegistry() {
    if (!existsSync(this.registryPath)) {
      this.models = [];
      this.loaded = true;
      return;
    }

    const raw = readFileSync(this.registryPath, 'utf-8');
    const data = JSON.parse(raw);
    const rawModels = data.models || [];

    this.models = rawModels.map((m) => {
      const inputTypes = inferInputTypes(m.params);
      const taskType = inferTaskType(m.output_type, inputTypes);

      return {
        endpoint: m.endpoint,
        name: m.display_name || m.name_cn || m.endpoint,
        nameCn: m.name_cn || '',
        nameEn: m.name_en || '',
        category: m.category || '',
        taskType,
        outputType: m.output_type,
        inputTypes,
        fields: (m.params || []).map(normalizeField),
        className: m.class_name || '',
      };
    });

    if (existsSync(this.pricingPath)) {
      try {
        const pricingRaw = readFileSync(this.pricingPath, 'utf-8');
        this.pricing = JSON.parse(pricingRaw);
      } catch {
        this.pricing = {};
      }
    }

    this.loaded = true;
  }

  ensureLoaded() {
    if (!this.loaded) this.loadRegistry();
  }

  listCapabilities() {
    this.ensureLoaded();
    const taskTypes = new Set();
    for (const m of this.models) {
      if (m.taskType) taskTypes.add(m.taskType);
    }
    return [...taskTypes];
  }

  listOutputTypes() {
    this.ensureLoaded();
    const types = new Set();
    for (const m of this.models) {
      if (m.outputType) types.add(m.outputType);
    }
    return [...types];
  }

  searchModels(filters = {}) {
    this.ensureLoaded();

    return this.models.filter((m) => {
      if (filters.taskType && m.taskType !== filters.taskType) return false;
      if (filters.outputType && m.outputType !== filters.outputType) return false;
      if (filters.category && !m.category.includes(filters.category)) return false;
      if (filters.endpoint && m.endpoint !== filters.endpoint) return false;
      if (filters.inputType) {
        const hasInput = (m.inputTypes || []).includes(filters.inputType);
        if (!hasInput && filters.inputType !== 'text') return false;
      }
      if (filters.keyword) {
        const kw = filters.keyword.toLowerCase();
        const match =
          m.name.toLowerCase().includes(kw) ||
          m.nameCn.toLowerCase().includes(kw) ||
          m.endpoint.toLowerCase().includes(kw) ||
          m.category.toLowerCase().includes(kw);
        if (!match) return false;
      }
      return true;
    });
  }

  getModelSchema(endpoint) {
    this.ensureLoaded();
    return this.models.find((m) => m.endpoint === endpoint) || null;
  }

  getPriceEstimate(endpoint) {
    if (!this.pricing || !this.pricing.models) return undefined;
    const p = this.pricing.models[endpoint];
    if (p) return p;
    for (const model of this.models) {
      if (model.endpoint === endpoint) {
        const byCategory = this.pricing[model.category];
        if (byCategory) return byCategory;
      }
    }
    return undefined;
  }

  recommend(intent = {}) {
    this.ensureLoaded();

    let candidates = [...this.models];

    if (intent.taskType) {
      candidates = candidates.filter((m) => m.taskType === intent.taskType);
    }

    if (candidates.length === 0) {
      candidates = [...this.models];
    }

    if (intent.hasImage) {
      const withImageInput = candidates.filter(
        (m) => (m.inputTypes || []).includes('image'),
      );
      if (withImageInput.length > 0) candidates = withImageInput;
    }

    if (intent.hasVideo) {
      const withVideoInput = candidates.filter(
        (m) => (m.inputTypes || []).includes('video'),
      );
      if (withVideoInput.length > 0) candidates = withVideoInput;
    }

    if (intent.hasAudio) {
      const withAudioInput = candidates.filter(
        (m) => (m.inputTypes || []).includes('audio'),
      );
      if (withAudioInput.length > 0) candidates = withAudioInput;
    }

    if (intent.preferredOutputType) {
      candidates = candidates.filter((m) => m.outputType === intent.preferredOutputType);
    }

    if (intent.keyword) {
      const kw = intent.keyword.toLowerCase();
      candidates = candidates.filter(
        (m) =>
          m.name.toLowerCase().includes(kw) ||
          m.nameCn.toLowerCase().includes(kw) ||
          m.category.toLowerCase().includes(kw),
      );
    }

    const top3 = candidates.slice(0, 3).map((m) => ({
      endpoint: m.endpoint,
      name: m.name,
      nameCn: m.nameCn,
      taskType: m.taskType,
      outputType: m.outputType,
      inputTypes: m.inputTypes,
      description: m.category,
      fields: m.fields,
      estimatedCost: this.getPriceEstimate(m.endpoint),
    }));

    return {
      recommendations: top3,
      totalMatched: candidates.length,
      taskType: intent.taskType || '',
      hasImage: !!intent.hasImage,
      hasVideo: !!intent.hasVideo,
    };
  }
}

const fs = require('fs');

const cfgPath = '/home/node/.openclaw/openclaw.json';
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error('DEEPSEEK_API_KEY not set');
  process.exit(1);
}

cfg.models = cfg.models || {};
cfg.models.mode = 'merge';
cfg.models.providers = cfg.models.providers || {};
cfg.models.providers.deepseek = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: apiKey,
  api: 'openai-completions',
  models: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat' }
  ]
};

cfg.agents = cfg.agents || {};
cfg.agents.defaults = cfg.agents.defaults || {};
cfg.agents.defaults.model = { primary: 'deepseek/deepseek-chat' };

fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
console.log('DeepSeek provider configured successfully');

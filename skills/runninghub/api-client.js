const BASE = 'https://rhtv.runninghub.cn';

export class RunningHubClient {
  constructor(cookieStr) {
    this.cookie = cookieStr || '';
  }

  headers() {
    return {
      'Content-Type': 'application/json',
      Cookie: this.cookie,
      Referer: 'https://rhtv.runninghub.cn/',
    };
  }

  async getModels() {
    const res = await fetch(`${BASE}/canvas/model/list`, { headers: this.headers() });
    return res.json();
  }

  async getCanvasList() {
    const res = await fetch(`${BASE}/canvas/list`, { headers: this.headers() });
    return res.json();
  }

  async getCommunityCompositions(categoryId = '') {
    const url = `${BASE}/canvas/community/composition/list` + (categoryId ? `?categoryId=${categoryId}` : '');
    const res = await fetch(url, { headers: this.headers() });
    return res.json();
  }

  async submitGeneration({ prompt, modelId, duration, resolution }) {
    const res = await fetch(`${BASE}/canvas/generate`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        prompt,
        modelId: modelId || 'default',
        duration: duration || 30,
        resolution: resolution || '1080p',
      }),
    });
    return res.json();
  }

  async getTaskStatus(taskId) {
    const res = await fetch(`${BASE}/canvas/task/${taskId}`, {
      headers: this.headers(),
    });
    return res.json();
  }
}

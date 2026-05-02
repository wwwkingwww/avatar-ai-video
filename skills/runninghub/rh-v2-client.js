const RH_BASE_URL = process.env.RH_API_BASE_URL || 'https://www.runninghub.cn';

export class RHV2Client {
  constructor(apiKey, baseUrl = RH_BASE_URL) {
    if (!apiKey) throw new Error('RH_API_KEY is required for V2 client');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  _headers(contentType = 'application/json') {
    const h = {
      'Host': 'www.runninghub.cn',
    };
    if (contentType) h['Content-Type'] = contentType;
    return h;
  }

  _authBody(extra = {}) {
    return { apiKey: this.apiKey, ...extra };
  }

  async _request(method, path, opts = {}) {
    const { body, isFormData } = opts;

    const url = `${this.baseUrl}${path}`;
    const fetchOpts = { method, headers: this._headers(isFormData ? undefined : 'application/json') };

    if (body) {
      fetchOpts.body = isFormData ? body : JSON.stringify(body);
    } else if (method !== 'GET' && !isFormData) {
      fetchOpts.body = JSON.stringify(this._authBody());
    }

    const res = await fetch(url, fetchOpts);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`RH V2 HTTP ${res.status} ${method} ${path}: ${text.substring(0, 300)}`);
    }

    const data = await res.json();
    if (data.code !== undefined && data.code !== 0) {
      throw new Error(`RH V2 API error code=${data.code}: ${data.msg || 'unknown'}`);
    }
    return data;
  }

  async uploadFile(fileBuffer, fileName, fileType) {
    const formData = new FormData();
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, fileName);
    formData.append('fileType', fileType);
    formData.append('apiKey', this.apiKey);

    const data = await this._request('POST', '/task/openapi/upload', {
      body: formData,
      isFormData: true,
    });
    return data.data;
  }

  async getNodes(webappId) {
    const res = await fetch(`${this.baseUrl}/api/webapp/apiCallDemo?webappId=${webappId}&apiKey=${this.apiKey}`, {
      headers: this._headers(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`RH V2 getNodes HTTP ${res.status}: ${text.substring(0, 300)}`);
    }
    const data = await res.json();
    if (data.code !== undefined && data.code !== 0) {
      throw new Error(`RH V2 getNodes error code=${data.code}: ${data.msg || 'unknown'}`);
    }
    return data.data?.nodeInfoList || [];
  }

  async submitTask(webappId, nodeInfoList) {
    const body = {
      webappId,
      apiKey: this.apiKey,
      nodeInfoList,
    };
    const data = await this._request('POST', '/task/openapi/ai-app/run', { body });
    return data.data;
  }

  async queryOutputs(taskId) {
    const body = this._authBody({ taskId });
    const data = await this._request('POST', '/task/openapi/outputs', { body });
    return {
      status: data.data?.taskStatus || data.data?.status,
      outputs: data.data?.outputs || data.data?.files || [],
      error: data.data?.failedReason || data.data?.error || null,
    };
  }

  async pollTask(taskId, timeoutMs = 10 * 60 * 1000, intervalMs = 5000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const result = await this.queryOutputs(taskId);
      const status = result.status?.toUpperCase();

      if (status === 'SUCCESS') return { status: 'SUCCESS', outputs: result.outputs };
      if (status === 'FAILED') throw new Error(`RH V2 task failed: ${result.error || 'unknown'}`);
      if (status === 'CANCEL') return { status: 'CANCEL', outputs: [] };

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(`RH V2 task ${taskId} timed out after ${timeoutMs / 60000}min`);
  }

  async runWorkflow(webappId, nodeInfoList, timeoutMs) {
    const { taskId } = await this.submitTask(webappId, nodeInfoList);
    return this.pollTask(taskId, timeoutMs);
  }
}

export function parseNodeInfoList(model, selectedParams, uploadResults = {}) {
  if (!model || !model.fields || !Array.isArray(model.fields)) return [];

  return model.fields.map((field) => {
    let fieldValue = selectedParams[field.fieldName] !== undefined
      ? selectedParams[field.fieldName]
      : field.fieldValue;

    const uploadKey = `${field.nodeId}:${field.fieldName}`;
    if (uploadResults[uploadKey]) {
      fieldValue = uploadResults[uploadKey].fileName;
    }

    return {
      nodeId: field.nodeId,
      fieldName: field.fieldName,
      fieldValue: String(fieldValue),
    };
  });
}

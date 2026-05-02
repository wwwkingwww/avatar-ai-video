import { describe, it, before, after } from 'node:test';
import { RHV2Client, parseNodeInfoList } from './rh-v2-client.js';

const BASE = 'https://mock-runninghub.local';
let client;

function responseFrom(json, status = 200) {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    json: async () => json,
    text: async () => JSON.stringify(json),
    ok: status >= 200 && status < 300,
  };
}

const mockResponses = {
  upload: { code: 0, msg: 'success', data: { fileName: 'api/test.png', fileType: 'image' } },
  submit: { code: 0, msg: 'success', data: { taskId: 'task-123', taskStatus: 'RUNNING' } },
  success: { code: 0, msg: 'success', data: { taskId: 'task-123', taskStatus: 'SUCCESS', outputs: [{ url: 'https://cdn.example.com/video.mp4', type: 'video' }] } },
  running: { code: 0, msg: 'success', data: { taskId: 'task-123', taskStatus: 'RUNNING' } },
  failed: { code: 0, msg: 'success', data: { taskId: 'task-123', taskStatus: 'FAILED', failedReason: 'node error' } },
  cancelled: { code: 0, msg: 'success', data: { taskId: 'task-123', taskStatus: 'CANCEL' } },
  error: { code: 500, msg: 'internal server error' },
};

describe('RHV2Client', () => {
  before(() => {
    client = new RHV2Client('rk-test-key', BASE);
  });

  after(() => {
    global.fetch = undefined;
  });

  it('throws if no API key', () => {
    let threw = false;
    try { new RHV2Client(''); } catch (e) { threw = true; }
    if (!threw) throw new Error('expected error for missing API key');
  });

  it('sets correct auth header', () => {
    const h = client._headers();
    if (h.Authorization !== 'Bearer rk-test-key') throw new Error('wrong auth header');
  });

  it('uploadFile returns file info', async () => {
    global.fetch = async () => responseFrom(mockResponses.upload);
    const result = await client.uploadFile(Buffer.from('fake'), 'test.png', 'image');
    if (result.fileName !== 'api/test.png') throw new Error(`expected api/test.png, got ${result.fileName}`);
  });

  it('submitTask returns taskId', async () => {
    global.fetch = async () => responseFrom(mockResponses.submit);
    const result = await client.submitTask('webapp-1', []);
    if (result.taskId !== 'task-123') throw new Error(`expected task-123, got ${result.taskId}`);
  });

  it('queryOutputs returns status and outputs', async () => {
    global.fetch = async () => responseFrom(mockResponses.success);
    const result = await client.queryOutputs('task-123');
    if (result.status !== 'SUCCESS') throw new Error(`expected SUCCESS, got ${result.status}`);
  });

  it('pollTask resolves on SUCCESS', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return responseFrom(calls >= 2 ? mockResponses.success : mockResponses.running);
    };
    const result = await client.pollTask('task-123', 30000, 10);
    if (result.status !== 'SUCCESS') throw new Error(`expected SUCCESS, got ${result.status}`);
  });

  it('pollTask rejects on FAILED', async () => {
    global.fetch = async () => responseFrom(mockResponses.failed, 200);
    let threw = false;
    try { await client.pollTask('task-123', 30000, 10); } catch (e) { threw = true; }
    if (!threw) throw new Error('expected poll to throw on FAILED');
  });

  it('pollTask returns CANCEL without throwing', async () => {
    global.fetch = async () => responseFrom(mockResponses.cancelled, 200);
    const result = await client.pollTask('task-123', 30000, 10);
    if (result.status !== 'CANCEL') throw new Error(`expected CANCEL, got ${result.status}`);
  });

  it('handles HTTP error response', async () => {
    global.fetch = async () => ({ status: 500, ok: false, text: async () => 'server error', json: async () => { throw new Error('no json'); } });
    let threw = false;
    try { await client._request('GET', '/some/path'); } catch (e) {
      if (!e.message.includes('HTTP 500')) throw new Error(`wrong error: ${e.message}`);
      threw = true;
    }
    if (!threw) throw new Error('expected error for HTTP 500');
  });
});

describe('parseNodeInfoList', () => {
  it('builds nodeInfoList from model fields and params', () => {
    const model = {
      fields: [
        { nodeId: '10', fieldName: 'prompt', fieldValue: 'default' },
        { nodeId: '11', fieldName: 'duration', fieldValue: '30' },
        { nodeId: '12', fieldName: 'image', fieldValue: 'old.jpg', fieldType: 'IMAGE' },
      ],
    };
    const params = { prompt: 'a cat', duration: 15 };
    const uploads = { '12:image': { fileName: 'api/new.jpg' } };
    const result = parseNodeInfoList(model, params, uploads);
    if (result.find((r) => r.fieldName === 'prompt').fieldValue !== 'a cat') throw new Error('prompt mismatch');
    if (result.find((r) => r.fieldName === 'duration').fieldValue !== '15') throw new Error('duration mismatch');
    if (result.find((r) => r.fieldName === 'image').fieldValue !== 'api/new.jpg') throw new Error('image upload mismatch');
  });

  it('returns empty array for null model', () => {
    const result = parseNodeInfoList(null, {}, {});
    if (result.length !== 0) throw new Error('expected empty array');
  });

  it('falls back to default fieldValue when param not set', () => {
    const model = { fields: [{ nodeId: '1', fieldName: 'prompt', fieldValue: 'hello' }] };
    const result = parseNodeInfoList(model, {}, {});
    if (result[0].fieldValue !== 'hello') throw new Error('expected default value');
  });
});

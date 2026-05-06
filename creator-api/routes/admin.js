import { Router } from 'express';
import prisma from '../prisma/client.js';
import { adminLogin, adminAuth } from '../middleware/admin-auth.js';

export const adminRouter = Router();

adminRouter.post('/login', (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: '请输入密码' });
    }
    const result = adminLogin(password);
    if (result.success) {
      return res.json({ success: true, token: result.token });
    }
    res.status(401).json({ success: false, error: result.error });
  } catch (e) {
    console.error('[admin] login error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

adminRouter.use(adminAuth);

adminRouter.get('/models', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { search, category, status } = req.query;

    const where = {};

    if (category && category !== 'all') {
      where.category = category;
    }
    if (status && status !== 'all') {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { nameCn: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
        { endpoint: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, models] = await Promise.all([
      prisma.modelRegistry.count({ where }),
      prisma.modelRegistry.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({
      success: true,
      data: models,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    console.error('[admin] list models error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

adminRouter.get('/models/categories', async (_req, res) => {
  try {
    const categories = await prisma.modelRegistry.findMany({
      select: { category: true },
      distinct: ['category'],
    });
    res.json({
      success: true,
      data: categories.map((c) => c.category).filter(Boolean).sort(),
    });
  } catch (e) {
    console.error('[admin] categories error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

adminRouter.get('/models/:id', async (req, res) => {
  try {
    const model = await prisma.modelRegistry.findUnique({
      where: { id: req.params.id },
    });
    if (!model) {
      return res.status(404).json({ success: false, error: '模型不存在' });
    }
    res.json({ success: true, data: model });
  } catch (e) {
    console.error('[admin] get model error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

adminRouter.post('/models', async (req, res) => {
  try {
    const { endpoint, nameCn, nameEn, category, taskType, outputType, inputTypes, params, className } = req.body;

    if (!endpoint) {
      return res.status(400).json({ success: false, error: 'endpoint 为必填项' });
    }

    const exists = await prisma.modelRegistry.findUnique({ where: { endpoint } });
    if (exists) {
      return res.status(409).json({ success: false, error: '该 endpoint 已存在' });
    }

    const model = await prisma.modelRegistry.create({
      data: {
        endpoint,
        nameCn: nameCn || '',
        nameEn: nameEn || '',
        category: category || '',
        taskType: taskType || '',
        outputType: outputType || '',
        inputTypes: inputTypes || [],
        params: params || [],
        className: className || '',
        status: 'draft',
        visible: false,
      },
    });

    res.status(201).json({ success: true, data: model });
  } catch (e) {
    console.error('[admin] create model error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

adminRouter.patch('/models/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['nameCn', 'nameEn', 'category', 'taskType', 'outputType', 'inputTypes', 'status', 'visible', 'params', 'className'];
    const data = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        data[key] = req.body[key];
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, error: '没有可更新的字段' });
    }

    const model = await prisma.modelRegistry.update({
      where: { id },
      data,
    });

    res.json({ success: true, data: model });
  } catch (e) {
    if (e.code === 'P2025') {
      return res.status(404).json({ success: false, error: '模型不存在' });
    }
    console.error('[admin] update model error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

adminRouter.delete('/models/:id', async (req, res) => {
  try {
    const model = await prisma.modelRegistry.findUnique({ where: { id: req.params.id } });
    if (!model) {
      return res.status(404).json({ success: false, error: '模型不存在' });
    }
    if (!['draft', 'disabled'].includes(model.status)) {
      return res.status(400).json({ success: false, error: '只能删除草稿或已禁用的模型' });
    }

    await prisma.modelRegistry.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) {
    console.error('[admin] delete model error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

adminRouter.post('/models/batch', async (req, res) => {
  try {
    const { ids, action } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '请选择要操作的模型' });
    }
    if (!['publish', 'disable'].includes(action)) {
      return res.status(400).json({ success: false, error: '无效的操作类型' });
    }

    const status = action === 'publish' ? 'published' : 'disabled';

    await prisma.modelRegistry.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });

    res.json({ success: true, affected: ids.length, status });
  } catch (e) {
    console.error('[admin] batch error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

adminRouter.post('/models/import', async (_req, res) => {
  try {
    const { spawn } = await import('child_process');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const scriptPath = join(__dirname, '..', 'scripts', 'import-models.js');

    const child = spawn('node', [scriptPath], { cwd: join(__dirname, '..') });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (code === 0) {
        res.json({ success: true, output: stdout.trim() });
      } else {
        res.status(500).json({ success: false, error: stderr || stdout });
      }
    });
  } catch (e) {
    console.error('[admin] import error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

adminRouter.get('/stats', async (_req, res) => {
  try {
    const [total, published, disabled, draft] = await Promise.all([
      prisma.modelRegistry.count(),
      prisma.modelRegistry.count({ where: { status: 'published' } }),
      prisma.modelRegistry.count({ where: { status: 'disabled' } }),
      prisma.modelRegistry.count({ where: { status: 'draft' } }),
    ]);

    res.json({
      success: true,
      data: { total, published, disabled, draft },
    });
  } catch (e) {
    console.error('[admin] stats error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

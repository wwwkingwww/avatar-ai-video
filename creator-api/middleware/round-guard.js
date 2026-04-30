import { getSession } from '../services/session-manager.js';

export function withSession(paramName = 'id') {
  return async (req, res, next) => {
    const sessionId = req.params[paramName];
    if (!sessionId) return res.status(400).json({ success: false, error: '缺少 session ID' });
    const session = await getSession(sessionId);
    if (!session) return res.status(404).json({ success: false, error: '会话不存在或已过期' });
    req.session = session;
    next();
  };
}

export function requireStatus(...statuses) {
  return (req, res, next) => {
    if (!statuses.includes(req.session.status)) {
      return res.status(409).json({ success: false, error: `会话状态为 ${req.session.status}，不支持此操作` });
    }
    next();
  };
}

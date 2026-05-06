import jwt from 'jsonwebtoken';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { logger } from '../services/logger.js';

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || (() => {
  const generated = randomBytes(32).toString('hex');
  logger.warn(`[admin-auth] ADMIN_JWT_SECRET not set. Generated random secret (will change on restart. All existing tokens will be invalidated). Set ADMIN_JWT_SECRET in .env for persistence.`);
  return generated;
})();
const TOKEN_EXPIRY = '7d';

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

let hashedPassword = null;

function hashPasswordSync(password) {
  if (!password) return null;
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPasswordSync(input, stored) {
  if (!input || !stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = Buffer.from(scryptSync(input, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS).toString('hex'));
  const storedBuf = Buffer.from(hash);
  if (computed.length !== storedBuf.length) return false;
  return timingSafeEqual(computed, storedBuf);
}

export function initAdminAuth() {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) {
    const generated = randomBytes(8).toString('hex');
    process.env.ADMIN_PASSWORD = generated;
    logger.info('[admin-auth] ADMIN_PASSWORD not set. A random password has been generated (check logs for first-run only).');
    logger.info(`[admin-auth] Generated admin password: ${generated}`);
  }
  hashedPassword = hashPasswordSync(process.env.ADMIN_PASSWORD);
  logger.info('[admin-auth] Initialized. Admin password configured.');
}

export function adminLogin(password) {
  if (!hashedPassword) initAdminAuth();
  if (verifyPasswordSync(password, hashedPassword)) {
    const token = jwt.sign({ role: 'admin', username: 'admin' }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    return { success: true, token };
  }
  return { success: false, error: '密码错误' };
}

export function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未授权：缺少认证令牌' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, error: '未授权：令牌无效或已过期' });
  }
}

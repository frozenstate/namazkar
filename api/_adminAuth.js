const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const COOKIE_NAME = 'namazkar_admin_session';
const SESSION_TTL_SECONDS = Number(process.env.ADMIN_PANEL_SESSION_TTL_SECONDS || 60 * 60 * 12);

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index === -1) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = value;
    return cookies;
  }, {});
}

function getSessionSecret() {
  const secret = process.env.ADMIN_PANEL_SESSION_SECRET || '';
  if (!secret) throw new Error('ADMIN_PANEL_SESSION_SECRET is required');
  return secret;
}

function getPasswordHash() {
  const hash = process.env.ADMIN_PANEL_PASSWORD_HASH || '';
  if (!hash) throw new Error('ADMIN_PANEL_PASSWORD_HASH is required');
  return hash;
}

function signSessionPayload(payload) {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function createSessionValue() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const nonce = crypto.randomBytes(16).toString('base64url');
  const payload = `${expiresAt}.${nonce}`;
  const signature = signSessionPayload(payload);
  return `v1.${payload}.${signature}`;
}

function verifySessionValue(value) {
  if (!value || typeof value !== 'string' || !value.startsWith('v1.')) return false;
  const parts = value.split('.');
  if (parts.length !== 4) return false;

  const [, expiresAtStr, nonce, signature] = parts;
  const payload = `${expiresAtStr}.${nonce}`;
  if (!timingSafeEqualString(signature, signSessionPayload(payload))) return false;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt)) return false;

  return expiresAt > Math.floor(Date.now() / 1000);
}

function getCookieValue(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies[COOKIE_NAME] || '';
}

function isHttpsRequest(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return proto === 'https' || process.env.NODE_ENV === 'production';
}

function getSessionCookieAttributes(req) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  return `HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

function createSessionCookie(req) {
  return `${COOKIE_NAME}=${createSessionValue()}; ${getSessionCookieAttributes(req)}`;
}

function clearSessionCookie(req) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`;
}

function isAdminAuthenticated(req) {
  return verifySessionValue(getCookieValue(req));
}

function requireAdminAuth(req, res) {
  if (isAdminAuthenticated(req)) return true;
  res.statusCode = 401;
  res.end('Unauthorized');
  return false;
}

function verifyAdminPassword(password) {
  return bcrypt.compareSync(password, getPasswordHash());
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  createSessionCookie,
  clearSessionCookie,
  isAdminAuthenticated,
  requireAdminAuth,
  verifyAdminPassword,
};
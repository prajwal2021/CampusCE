/**
 * Signed session cookie carrying a role ('admin' or 'user'). Uses Web Crypto so it runs in both
 * the Edge middleware and Node route handlers. Fails closed: with no SESSION_SECRET nothing
 * verifies and no token can be issued.
 */
export const COOKIE_NAME = 'flumen_session';
export const SESSION_HOURS = 12;

const enc = new TextEncoder();

async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createToken(role) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !['admin', 'user'].includes(role)) return null;
  const body = `${role}.${Date.now() + SESSION_HOURS * 3600_000}`;
  return `${body}.${await hmacHex(body, secret)}`;
}

/** Returns 'admin', 'user', or null. */
export async function verifyToken(token) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token) return null;
  const [role, exp, sig] = token.split('.');
  if (!['admin', 'user'].includes(role) || !exp || !sig || Number(exp) < Date.now()) return null;
  return safeEqual(sig, await hmacHex(`${role}.${exp}`, secret)) ? role : null;
}

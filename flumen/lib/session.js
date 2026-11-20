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

// Username travels hex-encoded so dots and @ in email addresses cannot break the token format.
const toHex = s => Array.from(enc.encode(s), b => b.toString(16).padStart(2, '0')).join('');
const fromHex = h => new TextDecoder().decode(new Uint8Array((h.match(/../g) || []).map(b => parseInt(b, 16))));

/** Token: role.expiry.userhex.signature */
export async function createToken(role, user) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !['admin', 'user'].includes(role) || !user) return null;
  const body = `${role}.${Date.now() + SESSION_HOURS * 3600_000}.${toHex(user)}`;
  return `${body}.${await hmacHex(body, secret)}`;
}

/** Returns { role, user } or null. */
export async function readToken(token) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token) return null;
  const [role, exp, userHex, sig] = token.split('.');
  if (!['admin', 'user'].includes(role) || !exp || !userHex || !sig || Number(exp) < Date.now()) return null;
  if (!/^[0-9a-f]+$/.test(userHex)) return null;
  return safeEqual(sig, await hmacHex(`${role}.${exp}.${userHex}`, secret)) ? { role, user: fromHex(userHex) } : null;
}

/** Returns 'admin', 'user', or null. */
export async function verifyToken(token) {
  return (await readToken(token))?.role ?? null;
}

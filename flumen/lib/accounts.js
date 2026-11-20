/**
 * Sign-in accounts. Usernames and starting passwords come from the env file on the server
 * (ADMIN_*, VIEWER_*, ACCOUNTS). A password a person changes in the app is stored as a salted
 * scrypt hash in PASSWORD_FILE (a mounted folder on the server), which then takes precedence.
 * Node runtime only.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';

const FILE = process.env.PASSWORD_FILE || '/data/passwords.json';

const digest = s => createHash('sha256').update(String(s)).digest();
const same = (a, b) => timingSafeEqual(digest(a), digest(b));
const key = user => String(user).trim().toLowerCase();

export function accounts() {
  const list = [];
  if (process.env.ADMIN_USER && process.env.ADMIN_PASSWORD) {
    list.push({ role: 'admin', user: process.env.ADMIN_USER, pass: process.env.ADMIN_PASSWORD });
  }
  if (process.env.VIEWER_USER && process.env.VIEWER_PASSWORD) {
    list.push({ role: 'user', user: process.env.VIEWER_USER, pass: process.env.VIEWER_PASSWORD });
  }
  // ACCOUNTS="role:username:password;role:username:password" for named accounts
  for (const entry of (process.env.ACCOUNTS || '').split(';')) {
    const [role, user, ...rest] = entry.trim().split(':');
    const pass = rest.join(':');
    if ((role === 'admin' || role === 'user') && user && pass) list.push({ role, user, pass });
  }
  return list;
}

function loadStore() {
  try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return {}; }
}

function hash(password) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`;
}

function checkHash(password, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const got = scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  const want = Buffer.from(hashHex, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Returns the matching account ({ role, user }) or null. */
export function authenticate(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  const store = loadStore();
  let found = null;
  for (const a of accounts()) {
    if (!same(key(username), key(a.user))) continue;
    const ok = store[key(a.user)] ? checkHash(password, store[key(a.user)]) : same(password, a.pass);
    if (ok) found = { role: a.role, user: a.user };
  }
  return found;
}

export function accountExists(user) {
  return accounts().some(a => key(a.user) === key(user));
}

export function setPassword(user, password) {
  const store = loadStore();
  store[key(user)] = hash(password);
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
  renameSync(tmp, FILE);
}

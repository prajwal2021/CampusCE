/**
 * Test enrollments kept out of the numbers. CampusCE staff test the store and courses with real
 * Canvas enrollments, then drop them; counted as ordinary drops they inflate the drop rate.
 *
 * The list lives in a JSON file in the server's mounted data folder (next to the password file),
 * not in the ADS tables, so a reload of the Canvas data never wipes it. A whole user can be marked
 * as a test account (every enrollment they have, now or later), or a single enrollment.
 * Node runtime only.
 */
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const FILE = process.env.EXCLUSIONS_FILE
  || join(dirname(process.env.PASSWORD_FILE || '/data/passwords.json'), 'exclusions.json');
const LOG_MAX = 1000;

const empty = () => ({ users: [], enrollments: [], log: [] });
let cache = { mtime: -1, data: empty() };

export function loadExclusions() {
  let mtime = 0;
  try { mtime = statSync(FILE).mtimeMs; } catch { return (cache = { mtime: 0, data: empty() }).data; }
  if (mtime === cache.mtime) return cache.data;
  try {
    const d = JSON.parse(readFileSync(FILE, 'utf8'));
    cache = { mtime, data: { users: d.users || [], enrollments: d.enrollments || [], log: d.log || [] } };
  } catch (e) {
    console.error('[flumen] exclusions file unreadable:', e.message);
    cache = { mtime, data: empty() };
  }
  return cache.data;
}

function save(data) {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tmp, FILE);
  cache = { mtime: -1, data };
}

const ids = list => list.map(x => Number(x.id)).filter(Number.isSafeInteger);

/**
 * SQL condition that is true for real (non-test) enrollments of alias a.
 * Ids are validated integers, so they are inlined and the condition can be added to any query.
 */
export function notTest(a = 'e') {
  const { users, enrollments } = loadExclusions();
  const u = ids(users), en = ids(enrollments);
  const parts = [];
  if (u.length) parts.push(`${a}.user_id = ANY('{${u.join(',')}}'::bigint[])`);
  if (en.length) parts.push(`${a}.id = ANY('{${en.join(',')}}'::bigint[])`);
  return parts.length ? `NOT (${parts.join(' OR ')})` : 'TRUE';
}

/** The opposite: true for test enrollments. */
export function isTest(a = 'e') {
  const c = notTest(a);
  return c === 'TRUE' ? 'FALSE' : c.slice(4);
}

/** Whether the request asked to keep test enrollments in (?tests=include). */
export const includeTests = sp => sp.get('tests') === 'include';

/**
 * Add or remove entries. items: [{ id, name, ce, course }]; kind: 'user' | 'enrollment'.
 * Every change is kept in the log with who made it and why.
 */
export function changeExclusions({ action, kind, items, reason, by }) {
  const data = structuredClone(loadExclusions());
  const key = kind === 'user' ? 'users' : 'enrollments';
  const at = new Date().toISOString();
  const have = new Set(data[key].map(x => String(x.id)));
  let changed = 0;
  for (const it of items) {
    const id = String(it.id);
    if (!/^\d+$/.test(id)) continue;
    if (action === 'add' && !have.has(id)) {
      data[key].push({ id, name: it.name || null, ce: it.ce || null, course: it.course || null, reason: reason || null, by, at });
      have.add(id);
    } else if (action === 'remove' && have.has(id)) {
      data[key] = data[key].filter(x => String(x.id) !== id);
      have.delete(id);
    } else continue;
    changed++;
    data.log.unshift({ at, by, action, kind, id, name: it.name || null, course: it.course || null, reason: reason || null });
  }
  data.log = data.log.slice(0, LOG_MAX);
  if (changed) save(data);
  return { changed, data };
}

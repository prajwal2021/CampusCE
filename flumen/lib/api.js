/**
 * Client-side API helper. Prepends the basePath so fetch calls
 * resolve correctly behind the /flumen nginx proxy.
 */
const ROOT = process.env.NEXT_PUBLIC_BASE_PATH || '';
const BASE = ROOT + '/api';

/** Session expired or missing: send the browser to sign in, then back to this page. */
function toLogin(path, res) {
  if (res.status !== 401 || path.startsWith('/auth') || typeof window === 'undefined') return false;
  const here = window.location.pathname.slice(ROOT.length) || '/';
  window.location.href = `${ROOT}/login?next=${encodeURIComponent(here + window.location.search)}`;
  return true;
}

export async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (toLogin(path, res)) return new Promise(() => {});
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function post(path, body = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (toLogin(path, res)) return new Promise(() => {});
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

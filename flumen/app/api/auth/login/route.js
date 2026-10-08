import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { COOKIE_NAME, SESSION_HOURS, createToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

const attempts = new Map(); // ip -> { count, resetAt }
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60_000;

const digest = s => createHash('sha256').update(String(s)).digest();
const same = (a, b) => timingSafeEqual(digest(a), digest(b));

function accounts() {
  const list = [];
  if (process.env.ADMIN_USER && process.env.ADMIN_PASSWORD) {
    list.push({ role: 'admin', user: process.env.ADMIN_USER, pass: process.env.ADMIN_PASSWORD });
  }
  if (process.env.VIEWER_USER && process.env.VIEWER_PASSWORD) {
    list.push({ role: 'user', user: process.env.VIEWER_USER, pass: process.env.VIEWER_PASSWORD });
  }
  return list;
}

export async function POST(request) {
  const list = accounts();
  if (list.length === 0 || !process.env.SESSION_SECRET) {
    return NextResponse.json({ error: 'Sign-in is not configured on this server yet.' }, { status: 503 });
  }

  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const rec = attempts.get(ip);
  if (rec && rec.resetAt > now && rec.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
  }

  const { username, password } = await request.json().catch(() => ({}));
  let role = null;
  for (const a of list) {
    const ok = typeof username === 'string' && typeof password === 'string' && same(username, a.user) && same(password, a.pass);
    if (ok) role = a.role;
  }

  if (!role) {
    const r = rec && rec.resetAt > now ? rec : { count: 0, resetAt: now + WINDOW_MS };
    r.count++;
    attempts.set(ip, r);
    return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
  }

  attempts.delete(ip);
  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(COOKIE_NAME, await createToken(role), {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.headers.get('x-forwarded-proto') === 'https',
    path: process.env.NEXT_PUBLIC_BASE_PATH || '/',
    maxAge: SESSION_HOURS * 3600,
  });
  return res;
}

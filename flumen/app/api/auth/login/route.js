import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { COOKIE_NAME, SESSION_HOURS, createToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

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
  // ACCOUNTS="role:username:password;role:username:password" for named accounts
  for (const entry of (process.env.ACCOUNTS || '').split(';')) {
    const [role, user, ...rest] = entry.trim().split(':');
    const pass = rest.join(':');
    if ((role === 'admin' || role === 'user') && user && pass) list.push({ role, user, pass });
  }
  return list;
}

export async function POST(request) {
  const list = accounts();
  if (list.length === 0 || !process.env.SESSION_SECRET) {
    return NextResponse.json({ error: 'Sign-in is not configured on this server yet.' }, { status: 503 });
  }

  const { username, password } = await request.json().catch(() => ({}));
  let role = null;
  for (const a of list) {
    const ok = typeof username === 'string' && typeof password === 'string' && same(username.trim().toLowerCase(), a.user.toLowerCase()) && same(password, a.pass);
    if (ok) role = a.role;
  }

  if (!role) {
    return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
  }

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

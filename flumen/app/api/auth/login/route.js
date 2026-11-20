import { NextResponse } from 'next/server';
import { COOKIE_NAME, SESSION_HOURS, createToken } from '@/lib/session';
import { accounts, authenticate } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (accounts().length === 0 || !process.env.SESSION_SECRET) {
    return NextResponse.json({ error: 'Sign-in is not configured on this server yet.' }, { status: 503 });
  }

  const { username, password } = await request.json().catch(() => ({}));
  const account = authenticate(username, password);
  if (!account) {
    return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, role: account.role });
  res.cookies.set(COOKIE_NAME, await createToken(account.role, account.user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.headers.get('x-forwarded-proto') === 'https',
    path: process.env.NEXT_PUBLIC_BASE_PATH || '/',
    maxAge: SESSION_HOURS * 3600,
  });
  return res;
}

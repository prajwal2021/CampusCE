import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { COOKIE_NAME, SESSION_HOURS, createToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

const attempts = new Map(); // ip -> { count, resetAt }
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60_000;

const digest = s => createHash('sha256').update(String(s)).digest();

export async function POST(request) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !process.env.SESSION_SECRET) {
    return NextResponse.json({ error: 'Admin sign-in is not configured on this server yet.' }, { status: 503 });
  }

  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const rec = attempts.get(ip);
  if (rec && rec.resetAt > now && rec.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
  }

  const { password } = await request.json().catch(() => ({}));
  const ok = typeof password === 'string' && timingSafeEqual(digest(password), digest(expected));
  if (!ok) {
    const r = rec && rec.resetAt > now ? rec : { count: 0, resetAt: now + WINDOW_MS };
    r.count++;
    attempts.set(ip, r);
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, await createToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.headers.get('x-forwarded-proto') === 'https',
    path: process.env.NEXT_PUBLIC_BASE_PATH || '/',
    maxAge: SESSION_HOURS * 3600,
  });
  return res;
}

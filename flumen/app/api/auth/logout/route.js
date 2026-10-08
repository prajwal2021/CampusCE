import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', { httpOnly: true, path: process.env.NEXT_PUBLIC_BASE_PATH || '/', maxAge: 0 });
  return res;
}

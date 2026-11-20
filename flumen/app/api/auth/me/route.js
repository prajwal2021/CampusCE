import { NextResponse } from 'next/server';
import { COOKIE_NAME, readToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = await readToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: 'Sign-in required' }, { status: 401 });
  return NextResponse.json(session);
}

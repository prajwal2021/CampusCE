import { NextResponse } from 'next/server';
import { COOKIE_NAME, readToken } from '@/lib/session';
import { accountExists, authenticate, setPassword } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const session = await readToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: 'Sign-in required' }, { status: 401 });
  if (!accountExists(session.user)) return NextResponse.json({ error: 'This account can no longer sign in.' }, { status: 403 });

  const { current, next } = await request.json().catch(() => ({}));
  if (typeof current !== 'string' || typeof next !== 'string') {
    return NextResponse.json({ error: 'Enter your current and new password.' }, { status: 400 });
  }
  if (!authenticate(session.user, current)) {
    return NextResponse.json({ error: 'Your current password is incorrect.' }, { status: 400 });
  }
  if (next.length < 8) {
    return NextResponse.json({ error: 'The new password must be at least 8 characters.' }, { status: 400 });
  }
  if (next === current) {
    return NextResponse.json({ error: 'The new password must be different from the current one.' }, { status: 400 });
  }

  try {
    setPassword(session.user, next);
  } catch {
    return NextResponse.json({ error: 'Could not save the new password right now.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

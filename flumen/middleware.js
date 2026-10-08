import { NextResponse } from 'next/server';
import { COOKIE_NAME, verifyToken } from '@/lib/session';

/**
 * Everything except the public overview (/, /browse, /courses, /api/portal) and
 * the sign-in endpoints requires an admin session.
 */
export const config = { matcher: ['/admin/:path*', '/api/:path*'] };

export async function middleware(req) {
  const path = req.nextUrl.pathname;
  if (path.startsWith('/api/portal') || path.startsWith('/api/auth')) return NextResponse.next();

  if (await verifyToken(req.cookies.get(COOKIE_NAME)?.value)) return NextResponse.next();

  if (path.startsWith('/api/')) {
    return NextResponse.json({ error: 'Admin sign-in required' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', path);
  return NextResponse.redirect(url);
}

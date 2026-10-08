import { NextResponse } from 'next/server';
import { COOKIE_NAME, verifyToken } from '@/lib/session';

/**
 * Access rules
 *   open:        /login, /api/auth/*
 *   admin only:  /admin/*, every /api/* except /api/portal/* and /api/auth/*
 *   user+admin:  the overview pages and /api/portal/*
 */
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };

export async function middleware(req) {
  const path = req.nextUrl.pathname;
  if (path === '/login' || path.startsWith('/api/auth')) return NextResponse.next();

  const role = await verifyToken(req.cookies.get(COOKIE_NAME)?.value);
  const isApi = path.startsWith('/api/');
  const adminOnly = path.startsWith('/admin') || (isApi && !path.startsWith('/api/portal'));

  if (role === 'admin' || (role === 'user' && !adminOnly)) return NextResponse.next();

  if (isApi) {
    return NextResponse.json({ error: role ? 'Admin access required' : 'Sign-in required' }, { status: role ? 403 : 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = role ? '/' : '/login';
  url.search = '';
  if (!role) url.searchParams.set('next', path);
  return NextResponse.redirect(url);
}

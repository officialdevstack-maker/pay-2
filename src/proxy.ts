import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'spurs_pay_session';

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith('/auth/') || path === '/signed-out' || path.startsWith('/api/hooks/')) {
    return NextResponse.next();
  }

  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    const login = new URL('/auth/login', request.url);
    login.searchParams.set('returnTo', `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

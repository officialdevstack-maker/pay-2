import { NextResponse } from 'next/server';
import { assertSameOrigin } from '@/lib/csrf';
import { route } from '@/lib/request';
import { cookieOptions, SESSION_COOKIE, signOut } from '@/modules/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (request) => {
  assertSameOrigin(request);
  const logoutUrl = await signOut();
  const response = NextResponse.redirect(logoutUrl, 303);
  response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
  return response;
});

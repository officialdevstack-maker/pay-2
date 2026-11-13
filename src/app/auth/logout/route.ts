import { NextRequest, NextResponse } from 'next/server';
import { cookieOptions, signOut, SESSION_COOKIE } from '@/modules/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const logoutUrl = await signOut(request.cookies.get(SESSION_COOKIE)?.value);
  const response = NextResponse.redirect(logoutUrl);
  response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
  return response;
}

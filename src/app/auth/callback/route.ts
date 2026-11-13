import { NextRequest, NextResponse } from 'next/server';
import { cookieOptions, finishSignIn } from '@/modules/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { sessionId, returnTo } = await finishSignIn(request.url);
  const response = NextResponse.redirect(new URL(returnTo, request.nextUrl.origin));
  response.cookies.set('spurs_pay_session', sessionId, cookieOptions());
  return response;
}

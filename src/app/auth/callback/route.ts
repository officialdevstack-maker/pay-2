import { NextResponse } from 'next/server';
import { env } from '@/env';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { route } from '@/lib/request';
import { cookieOptions, finishSignIn, SESSION_COOKIE } from '@/modules/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (request) => {
  try {
    const { sessionId, returnTo } = await finishSignIn(request.url);
    const response = NextResponse.redirect(new URL(returnTo, env.APP_URL));
    response.cookies.set(SESSION_COOKIE, sessionId, cookieOptions());
    return response;
  } catch (error) {
    if (error instanceof AppError && error.status < 500) {
      logger.warn('sign-in not completed', { code: error.code });
      return NextResponse.redirect(new URL('/signed-out?error=signin', env.APP_URL));
    }
    throw error;
  }
});

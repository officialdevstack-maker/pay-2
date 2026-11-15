import { NextResponse } from 'next/server';
import { route } from '@/lib/request';
import { beginSignIn } from '@/modules/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (request) => {
  const params = new URL(request.url).searchParams;
  const url = await beginSignIn(params.get('returnTo'), { stepUp: params.get('stepUp') === '1' });
  return NextResponse.redirect(url);
});

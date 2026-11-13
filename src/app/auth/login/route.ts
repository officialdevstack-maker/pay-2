import { NextRequest, NextResponse } from 'next/server';
import { beginSignIn } from '@/modules/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = await beginSignIn(request.nextUrl.searchParams.get('returnTo'));
  return NextResponse.redirect(url);
}

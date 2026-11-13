import { z } from 'zod';
import { assertSameOrigin } from '@/lib/csrf';
import { AppError } from '@/lib/errors';
import { route } from '@/lib/request';
import { requireApiUser } from '@/modules/identity';
import { setTag } from '@/modules/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({ tag: z.string().min(1).max(40) });

export const PUT = route(async (request) => {
  assertSameOrigin(request);
  const user = await requireApiUser();
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new AppError('VALIDATION_FAILED', 'Enter a tag.', 422);

  const tag = await setTag(user.id, parsed.data.tag);
  return Response.json({ tag }, { headers: { 'cache-control': 'no-store' } });
});

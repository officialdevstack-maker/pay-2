import 'server-only';
import { AppError } from '@/lib/errors';
import { db } from '@/server/db/client';
import { notifications } from '@/server/db/schema';

export interface NotificationInput {
  type: string;
  title: string;
  body: string;
  reference?: string;
}

export async function notify(userId: string, input: NotificationInput): Promise<void> {
  const [created] = await db
    .insert(notifications)
    .values({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      reference: input.reference ?? null,
    })
    .returning({ id: notifications.id });
  if (!created) throw new AppError('INTERNAL', 'Could not create notification.');
}

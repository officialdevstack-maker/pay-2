import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { env } from '@/env';
import { db } from '@/server/db/client';
import { payUsers } from '@/server/db/schema';

export type NotificationEmailMode = 'if_enabled' | 'always';

export interface NotificationInput {
  type: string;
  title: string;
  body: string;
  reference?: string;
  email?: NotificationEmailMode;
}

export interface RemoteNotification {
  id: string;
  notifiableId: string;
  type: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

async function notificationApi(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: URL,
  body?: unknown,
): Promise<unknown> {
  if (!env.NOTIFICATIONS_SERVICE_URL || !env.NOTIFICATIONS_SERVICE_API_KEY) {
    throw new AppError('INTERNAL', 'Notification service is not configured.');
  }
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.NOTIFICATIONS_SERVICE_API_KEY}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const message =
      result !== null && typeof result === 'object' && 'message' in result && typeof result.message === 'string'
        ? result.message
        : 'Unknown notification service error.';
    throw new AppError('INTERNAL', `Notification service returned ${response.status}: ${message}`);
  }
  if (result === null || typeof result !== 'object' || !('data' in result)) {
    throw new AppError('INTERNAL', 'Notification service returned an invalid response.');
  }
  return result.data;
}

function notificationUrl(): URL {
  if (!env.NOTIFICATIONS_SERVICE_URL) {
    throw new AppError('INTERNAL', 'Notification service is not configured.');
  }
  return new URL('/api/v1/notifications', env.NOTIFICATIONS_SERVICE_URL);
}

function isRemoteNotification(value: unknown): value is RemoteNotification {
  return (
    value !== null &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string' &&
    'type' in value &&
    typeof value.type === 'string' &&
    'notifiableId' in value &&
    typeof value.notifiableId === 'string' &&
    'data' in value &&
    value.data !== null &&
    typeof value.data === 'object' &&
    'readAt' in value &&
    (typeof value.readAt === 'string' || value.readAt === null) &&
    'createdAt' in value &&
    typeof value.createdAt === 'string' &&
    'updatedAt' in value &&
    typeof value.updatedAt === 'string'
  );
}

export async function notify(userId: string, input: NotificationInput): Promise<void> {
  const channels: {
    database: { data: Record<string, unknown> };
    mail?: { to: string; subject: string; text: string };
  } = {
    database: {
      data: {
        title: input.title,
        body: input.body,
        ...(input.reference ? { reference: input.reference } : {}),
      },
    },
  };

  if (input.email) {
    const [user] = await db
      .select({ email: payUsers.email, emailNotifications: payUsers.emailNotifications })
      .from(payUsers)
      .where(eq(payUsers.id, userId))
      .limit(1);
    if (user?.email && (input.email === 'always' || user.emailNotifications)) {
      channels.mail = { to: user.email, subject: input.title, text: input.body };
    }
  }

  await notificationApi('POST', notificationUrl(), {
    id: randomUUID(),
    notifiableId: userId,
    type: input.type,
    queue: false,
    delayMs: 0,
    channels,
  });
}

export async function listNotifications(
  userId: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<RemoteNotification[]> {
  const url = notificationUrl();
  url.searchParams.set('notifiableId', userId);
  url.searchParams.set('limit', String(options.limit ?? 50));
  if (options.unreadOnly) url.searchParams.set('unreadOnly', 'true');
  const data = await notificationApi('GET', url);
  if (!Array.isArray(data) || !data.every(isRemoteNotification)) {
    throw new AppError('INTERNAL', 'Notification service returned an invalid inbox.');
  }
  return data;
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  await notificationApi('PATCH', notificationUrl(), { notificationId, notifiableId: userId });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await notificationApi('PATCH', notificationUrl(), { notifiableId: userId });
}

export async function deleteNotifications(userId: string): Promise<void> {
  const url = notificationUrl();
  url.searchParams.set('notifiableId', userId);
  await notificationApi('DELETE', url);
}

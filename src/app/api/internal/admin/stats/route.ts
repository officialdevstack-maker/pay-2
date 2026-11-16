import { getAdminStats } from '@/modules/admin';
import { internalAdminRoute } from '@/modules/admin/internal-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = internalAdminRoute(async () => Response.json(await getAdminStats()));

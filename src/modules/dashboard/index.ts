import 'server-only';
import { listActivity, type ActivityItem } from '@/modules/activity';

export interface HomeData {
  activity: ActivityItem[];
}

export async function getHomeData(userId: string): Promise<HomeData> {
  return { activity: await listActivity(userId, 'all', 5) };
}

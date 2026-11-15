import 'server-only';
import { listActivity, type ActivityItem } from '@/modules/activity';
import { listPaymentMethods, type PaymentMethodView } from '@/modules/payment-methods';

export interface HomeData {
  methods: PaymentMethodView[];
  activity: ActivityItem[];
}

export async function getHomeData(userId: string): Promise<HomeData> {
  const [methods, activity] = await Promise.all([listPaymentMethods(userId), listActivity(userId, 'all', 5)]);
  return { methods, activity };
}

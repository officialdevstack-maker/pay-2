import Link from 'next/link';
import { AsideCard } from '@/components/home/aside-card';
import { RecentActivity } from '@/components/home/recent-activity';
import { SetupChecklist, type SetupItem } from '@/components/home/setup-checklist';
import { PaymentMethodsCard } from '@/components/payment-methods/payment-methods-card';
import { PageLayout } from '@/components/shell/page-layout';
import { FEATURES } from '@/config/features';
import { env } from '@/env';
import { getHomeData } from '@/modules/dashboard';
import { requireUser } from '@/modules/identity';

export default async function HomePage() {
  const user = await requireUser();
  const data = await getHomeData(user.id);
  const accountsUrl = new URL(env.ACCOUNTS_ISSUER).origin;

  const setup: SetupItem[] = user.emailVerified ? [] : [{ label: 'Verify your email', href: accountsUrl }];
  const attention = data.methods.filter((method) => method.needsAttention).length;

  return (
    <PageLayout
      aside={
        <>
          <AsideCard title="Pay faster at checkout" action={<Link href="/payment-methods">View payment methods</Link>}>
            Save a card once, then pay for Spurs products in a few taps.
          </AsideCard>
          <AsideCard title="Your details" action={<a href={accountsUrl}>Manage in Spurs Accounts</a>}>
            Your name and email come from your Spurs account.
          </AsideCard>
        </>
      }
    >
      <h1 className="sr-only">Home</h1>

      <div className="space-y-8">
        <SetupChecklist items={setup} />

        <section aria-labelledby="methods-heading" className="space-y-3">
          <div className="space-y-1">
            <h2 id="methods-heading" className="type-title">
              Payment methods
            </h2>
            {attention > 0 ? (
              <p className="type-body-sm text-muted">
                {attention === 1
                  ? '1 payment method needs your attention. Fix it to keep using it at checkout.'
                  : `${attention} payment methods need your attention. Fix them to keep using them at checkout.`}
              </p>
            ) : null}
          </div>
          <PaymentMethodsCard methods={data.methods} canAdd={FEATURES.cardTokenization} />
        </section>

        <RecentActivity items={data.activity} />
      </div>
    </PageLayout>
  );
}

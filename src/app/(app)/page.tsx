import { AsideCard } from '@/components/home/aside-card';
import { RecentActivity } from '@/components/home/recent-activity';
import { SetupChecklist, type SetupItem } from '@/components/home/setup-checklist';
import { env } from '@/env';
import { getHomeData } from '@/modules/dashboard';
import { requireUser } from '@/modules/identity';

export default async function HomePage() {
  const user = await requireUser();
  const data = await getHomeData(user.id);
  const accountsUrl = new URL(env.ACCOUNTS_ISSUER).origin;

  const setup: SetupItem[] = user.emailVerified
    ? []
    : [{ label: 'Verify your email', href: accountsUrl }];

  return (
    <div className="pt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
      <h1 className="sr-only">Home</h1>

      <div className="space-y-6">
        <SetupChecklist items={setup} />
        <RecentActivity items={data.activity} />
      </div>

      <aside aria-label="About your account" className="hidden space-y-4 lg:block">
        <AsideCard title="Your details" action={<a href={accountsUrl}>Manage in Spurs Accounts</a>}>
          Your name and email come from your Spurs account.
        </AsideCard>
      </aside>
    </div>
  );
}

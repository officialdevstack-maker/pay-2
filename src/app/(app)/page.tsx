import Link from 'next/link';
import { AsideCard } from '@/components/home/aside-card';
import { PaySearch } from '@/components/home/pay-search';
import { PeopleGrid } from '@/components/home/people-grid';
import { QuickActions } from '@/components/home/quick-actions';
import { RecentActivity } from '@/components/home/recent-activity';
import { SetupChecklist, type SetupItem } from '@/components/home/setup-checklist';
import { env } from '@/env';
import { getHomeData } from '@/modules/dashboard';
import { requireUser } from '@/modules/identity';

export default async function HomePage() {
  const user = await requireUser();
  const data = await getHomeData(user.id);
  const accountsUrl = new URL(env.ACCOUNTS_ISSUER).origin;

  const setup: SetupItem[] = [
    ...(user.emailVerified ? [] : [{ label: 'Verify your email', href: accountsUrl }]),
    ...(data.tag ? [] : [{ label: 'Choose your @tag', href: '/settings/tag' }]),
    ...(data.pinSet ? [] : [{ label: 'Set your transaction PIN', href: '/settings/pin' }]),
  ];

  const sendHref = setup.find((item) => item.href.startsWith('/'))?.href ?? '/pay';

  return (
    <div className="pt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
      <h1 className="sr-only">Home</h1>

      <div className="space-y-6">
        <PaySearch />
        <SetupChecklist items={setup} />
        <QuickActions sendHref={sendHref} setupIncomplete={setup.length > 0} />
        <PeopleGrid people={data.people} />
        <RecentActivity items={data.activity} />
      </div>

      <aside aria-label="About your account" className="hidden space-y-4 lg:block">
        <AsideCard title="Add money from any bank app" action={<Link href="/add-money">Add money</Link>}>
          Transfer to your Spurs Pay account. It is ready to send once the transfer arrives.
        </AsideCard>
        <AsideCard title="Your details" action={<a href={accountsUrl}>Manage in Spurs Accounts</a>}>
          Your name and email come from your Spurs account.
        </AsideCard>
      </aside>
    </div>
  );
}

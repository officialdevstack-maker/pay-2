import { Clock } from 'lucide-react';
import { AmountDisplay } from '@/components/ui/amount-display';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { formatActivityTime } from '@/lib/datetime';
import { ACTIVITY_FILTERS, listActivity, parseFilter } from '@/modules/activity';
import { requireUser } from '@/modules/identity';

function labelForFilter(filter: (typeof ACTIVITY_FILTERS)[number]) {
  switch (filter) {
    case 'all':
      return 'All';
    case 'sent':
      return 'Sent';
    case 'received':
      return 'Received';
    default:
      return filter;
  }
}

export default async function ActivityPage({ searchParams }: { searchParams?: Promise<{ filter?: string }> | { filter?: string } }) {
  const user = await requireUser();
  const params = await Promise.resolve(searchParams ?? {});
  const filter = parseFilter(params.filter);
  const items = await listActivity(user.id, filter, 20);

  return (
    <div className="space-y-5 pt-2">
      <PageHeader title="Activity" description="Your recent payments." />
      <Segmented
        label="Activity filters"
        items={ACTIVITY_FILTERS.map((item) => ({
          label: labelForFilter(item),
          href: `/activity?filter=${item}`,
          active: item === filter,
        }))}
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState icon={Clock}>No payments yet.</EmptyState>
        </Card>
      ) : (
        <ListGroup>
          {items.map((item) => (
            <ListRow
              key={item.reference}
              leading={null}
              title={item.title}
              subtitle={`${item.label} · ${formatActivityTime(item.createdAt)}`}
              trailing={<AmountDisplay kobo={item.amount} sign={item.kind} />}
              href={`/activity/${encodeURIComponent(item.reference)}`}
            />
          ))}
        </ListGroup>
      )}
    </div>
  );
}

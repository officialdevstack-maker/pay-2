import { Clock } from 'lucide-react';
import Link from 'next/link';
import { AmountDisplay } from '@/components/ui/amount-display';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { formatActivityTime } from '@/lib/datetime';
import type { ActivityItem } from '@/modules/activity';

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <section aria-labelledby="activity-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="activity-heading" className="type-heading">
          Recent activity
        </h2>
        <Link href="/activity" className="type-body-sm inline-flex h-11 items-center px-2 font-semibold text-primary">
          See all
        </Link>
      </div>
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={Clock} action={<Link href="/add-money">Add money</Link>}>
            No activity yet. Add money to get started.
          </EmptyState>
        </Card>
      ) : (
        <ListGroup>
          {items.map((item) => (
            <ListRow
              key={item.reference}
              leading={<Avatar name={item.title} />}
              title={item.title}
              subtitle={`${item.label} · ${formatActivityTime(item.createdAt)}`}
              trailing={<AmountDisplay kobo={item.amount} sign={item.kind} />}
            />
          ))}
        </ListGroup>
      )}
    </section>
  );
}

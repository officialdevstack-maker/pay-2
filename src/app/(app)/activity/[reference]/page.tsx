import { notFound } from 'next/navigation';
import { AmountDisplay } from '@/components/ui/amount-display';
import { Card } from '@/components/ui/card';
import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { PageHeader } from '@/components/ui/page-header';
import { formatReceiptDate } from '@/lib/datetime';
import { getActivityReceipt } from '@/modules/activity';
import { requireUser } from '@/modules/identity';

export default async function ActivityReceiptPage({ params }: { params: Promise<{ reference: string }> }) {
  const user = await requireUser();
  const { reference } = await params;
  const receipt = await getActivityReceipt(user.id, decodeURIComponent(reference));

  if (!receipt) notFound();

  return (
    <div className="space-y-6 pt-2">
      <PageHeader title="Receipt" back={{ href: '/activity', label: 'Activity' }} />

      <Card className="p-6">
        <div className="space-y-3">
          <p className="type-body-sm text-muted">{receipt.label}</p>
          <AmountDisplay kobo={receipt.amount} size="xl" sign={receipt.kind} />
          <p className="type-body-sm text-muted">{receipt.title}</p>
        </div>
      </Card>

      <ListGroup>
        <ListRow title="Reference" subtitle={receipt.reference} />
        <ListRow title="Date" subtitle={formatReceiptDate(receipt.createdAt)} />
        <ListRow title="Type" subtitle={receipt.label} />
      </ListGroup>
    </div>
  );
}

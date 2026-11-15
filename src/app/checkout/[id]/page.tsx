import { Check, Clock, X } from 'lucide-react';
import { notFound } from 'next/navigation';
import { BankTransferPanel } from '@/components/checkout/bank-transfer-panel';
import { AmountDisplay } from '@/components/ui/amount-display';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { cn } from '@/lib/cn';
import { formatReceiptDate } from '@/lib/datetime';
import { effectiveStatus, getSessionForCheckout, getTransferDetails, returnHref } from '@/modules/checkout';
import { requireUser } from '@/modules/identity';

export const metadata = { title: 'Checkout' };

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const found = await getSessionForCheckout(id);
  if (!found) notFound();

  const { session, merchant } = found;
  const status = effectiveStatus(session);
  const back = returnHref(session, merchant);
  const transfer = status === 'open' ? await getTransferDetails(session.id) : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="space-y-1">
        <p className="type-body-sm text-muted">Payment to</p>
        <h1 className="type-title">{merchant.name}</h1>
      </header>

      <Card className="space-y-3 p-6">
        <AmountDisplay kobo={session.amount} size="xl" />
        {session.description ? <p className="type-body-sm text-muted">{session.description}</p> : null}
      </Card>

      <ListGroup>
        <ListRow title="Payment reference" subtitle={session.reference} />
        {status === 'open' ? <ListRow title="Pay before" subtitle={formatReceiptDate(session.expiresAt)} /> : null}
        {status === 'paid' && session.paidAt ? <ListRow title="Paid" subtitle={formatReceiptDate(session.paidAt)} /> : null}
      </ListGroup>

      {status === 'paid' ? <StatusPanel tone="success" title="Payment confirmed" body={`${merchant.name} has been paid.`} /> : null}
      {status === 'expired' ? (
        <StatusPanel tone="warning" title="This checkout has expired" body="Go back to the merchant to start a new payment." />
      ) : null}
      {status === 'cancelled' ? (
        <StatusPanel tone="danger" title="This checkout was cancelled" body="Go back to the merchant to start a new payment." />
      ) : null}

      {status === 'open' ? (
        <BankTransferPanel sessionId={session.id} amount={session.amount.toString()} initial={transfer} />
      ) : null}

      <a href={back} className={cn(buttonClasses(status === 'paid' ? 'primary' : 'ghost', 'lg', 'mt-auto w-full'))}>
        Return to {merchant.name}
      </a>
    </main>
  );
}

const PANEL = {
  success: { icon: Check, box: 'bg-success-soft text-success' },
  warning: { icon: Clock, box: 'bg-warning-soft text-foreground' },
  danger: { icon: X, box: 'bg-danger-soft text-danger' },
} as const;

function StatusPanel({ tone, title, body }: { tone: keyof typeof PANEL; title: string; body: string }) {
  const { icon: Icon, box } = PANEL[tone];
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
      <span className={cn('inline-flex size-14 items-center justify-center rounded-full', box)}>
        <Icon aria-hidden="true" size={28} strokeWidth={2} />
      </span>
      <h2 className="type-heading">{title}</h2>
      <p className="type-body-sm text-muted">{body}</p>
    </div>
  );
}

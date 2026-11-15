'use client';

import { Landmark } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AmountDisplay } from '@/components/ui/amount-display';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';

interface Details {
  bankName: string;
  accountName: string;
  accountNumber: string;
}

const POLL_MS = 5_000;

export function BankTransferPanel({
  sessionId,
  amount,
  initial,
}: {
  sessionId: string;
  amount: string;
  initial: Details | null;
}) {
  const router = useRouter();
  const [details, setDetails] = useState<Details | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!details) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/checkout/${sessionId}/status`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as { status?: string };
        if (data.status && data.status !== 'open') router.refresh();
      } catch {
        // offline or timeout: keep waiting, never claim a result
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [details, sessionId, router]);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/checkout/${sessionId}/bank-transfer`, { method: 'POST' });
      const data = (await response.json().catch(() => null)) as {
        transfer?: Details;
        error?: { message?: string };
      } | null;
      if (!response.ok || !data?.transfer) {
        setError(data?.error?.message ?? 'Something went wrong on our side. Try again.');
        return;
      }
      setDetails(data.transfer);
    } catch {
      setError('You appear to be offline.');
    } finally {
      setBusy(false);
    }
  }

  if (!details) {
    return (
      <section aria-labelledby="methods-heading" className="space-y-3">
        <h2 id="methods-heading" className="type-heading">
          Choose a payment method
        </h2>
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Button size="lg" className="w-full" loading={busy} onClick={start}>
          Pay by bank transfer
        </Button>
        <p className="type-body-sm text-muted">You are not charged until your transfer arrives.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="transfer-heading" className="space-y-4">
      <h2 id="transfer-heading" className="type-heading">
        Bank transfer
      </h2>

      <ListGroup>
        <ListRow
          leading={<Landmark aria-hidden="true" size={20} strokeWidth={1.75} className="text-muted" />}
          title="Bank"
          subtitle={details.bankName}
        />
        <ListRow title="Account name" subtitle={details.accountName} />
        <ListRow
          title="Account number"
          subtitle={details.accountNumber}
          trailing={<CopyButton value={details.accountNumber} label="Copy account number" />}
        />
      </ListGroup>

      <Card className="space-y-1 p-4">
        <p className="type-body-sm text-muted">Send exactly</p>
        <AmountDisplay kobo={BigInt(amount)} size="md" />
      </Card>

      <div role="status">
        <Banner tone="info">
          Waiting for your transfer. We will confirm it here once it arrives, usually within a few minutes. You can
          leave this page and check Activity.
        </Banner>
      </div>
    </section>
  );
}

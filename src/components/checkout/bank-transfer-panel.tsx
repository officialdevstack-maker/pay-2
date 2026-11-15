'use client';

import { Landmark } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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
  initialWaiting = false,
}: {
  sessionId: string;
  amount: string;
  initial: Details | null;
  initialWaiting?: boolean;
}) {
  const router = useRouter();
  const [details, setDetails] = useState<Details | null>(initial);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(initialWaiting);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    if (!details && !waiting) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/checkout/${sessionId}/status`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as { status?: string; attemptStatus?: string | null };
        if (data.status && data.status !== 'open') router.refresh();
        if (waiting && !data.attemptStatus) {
          setWaiting(false);
          idempotencyKey.current = null;
        }
      } catch {
        // offline or timeout: keep waiting, never claim a result
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [details, waiting, sessionId, router]);

  async function start() {
    if (busy || waiting) return;
    setBusy(true);
    setError(null);
    const key = (idempotencyKey.current ??= crypto.randomUUID());
    try {
      const response = await fetch(`/api/checkout/${sessionId}/bank-transfer`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
      });
      const data = (await response.json().catch(() => null)) as {
        transfer?: Details;
        error?: { message?: string };
      } | null;
      if (!response.ok || !data?.transfer) {
        if (response.status === 422) idempotencyKey.current = null;
        if (response.status === 409 || response.status >= 500) setWaiting(true);
        setError(data?.error?.message ?? 'Something went wrong on our side. Try again.');
        return;
      }
      setDetails(data.transfer);
      setWaiting(false);
    } catch {
      setWaiting(true);
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
        {waiting ? (
          <Banner tone="info">We are checking this payment. Do not start another payment while it is being confirmed.</Banner>
        ) : (
          <>
            <Button size="lg" className="w-full" loading={busy} onClick={start}>
              Pay by bank transfer
            </Button>
            <p className="type-body-sm text-muted">You are not charged until your transfer arrives.</p>
          </>
        )}
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

import { CircleAlert, CreditCard } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import type { PaymentMethodView } from '@/modules/payment-methods';

export function PaymentMethodsCard({ methods, canAdd }: { methods: PaymentMethodView[]; canAdd: boolean }) {
  if (methods.length === 0) {
    return (
      <Card>
        <EmptyState icon={CreditCard} action={canAdd ? <Link href="/payment-methods/add">Add payment method</Link> : undefined}>
          No payment methods yet.
        </EmptyState>
      </Card>
    );
  }

  return (
    <ListGroup>
      {methods.map((method) => (
        <ListRow
          key={method.id}
          leading={
            <span className="inline-flex h-10 w-14 items-center justify-center rounded-lg bg-sunken text-muted">
              <CreditCard aria-hidden="true" size={20} strokeWidth={1.75} />
            </span>
          }
          title={method.title}
          subtitle={
            method.needsAttention ? (
              <span className="text-danger">Update this card to keep using it</span>
            ) : (
              method.expiry
            )
          }
          trailing={
            method.needsAttention ? (
              <CircleAlert aria-label="Needs attention" size={20} strokeWidth={1.75} className="text-danger" />
            ) : undefined
          }
        />
      ))}
      {canAdd ? (
        <Link
          href="/payment-methods/add"
          className="type-body-strong flex h-14 items-center justify-center text-primary transition duration-press active:bg-sunken"
        >
          Add payment method
        </Link>
      ) : null}
    </ListGroup>
  );
}

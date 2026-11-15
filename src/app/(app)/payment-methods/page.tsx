import { Landmark } from 'lucide-react';
import Link from 'next/link';
import { AsideCard } from '@/components/home/aside-card';
import { PaymentMethodsCard } from '@/components/payment-methods/payment-methods-card';
import { PageLayout } from '@/components/shell/page-layout';
import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { PageHeader } from '@/components/ui/page-header';
import { FEATURES } from '@/config/features';
import { requireUser } from '@/modules/identity';
import { listPaymentMethods } from '@/modules/payment-methods';

export const metadata = { title: 'Payment methods' };

export default async function PaymentMethodsPage() {
  const user = await requireUser();
  const methods = await listPaymentMethods(user.id);
  const attention = methods.filter((method) => method.needsAttention).length;

  return (
    <PageLayout
      aside={
        <AsideCard title="Pay faster at checkout" action={<Link href="/activity">See your payments</Link>}>
          Once a card is saved, you can pay for Spurs products in a few taps.
        </AsideCard>
      }
    >
      <PageHeader
        title="Payment methods"
        description={
          attention > 0
            ? `${attention} payment method${attention === 1 ? ' needs' : 's need'} your attention. Fix ${
                attention === 1 ? 'it' : 'them'
              } to keep using ${attention === 1 ? 'it' : 'them'} at checkout.`
            : 'Cards and bank transfer you can use at checkout.'
        }
      />

      <div className="space-y-8">
        <section aria-labelledby="cards-heading" className="space-y-3">
          <h2 id="cards-heading" className="type-heading">
            Cards
          </h2>
          <PaymentMethodsCard methods={methods} canAdd={FEATURES.cardTokenization} />
        </section>

        <section aria-labelledby="transfer-heading" className="space-y-3">
          <h2 id="transfer-heading" className="type-heading">
            Bank transfer
          </h2>
          <ListGroup>
            <ListRow
              leading={
                <span className="inline-flex h-10 w-14 items-center justify-center rounded-lg bg-sunken text-muted">
                  <Landmark aria-hidden="true" size={20} strokeWidth={1.75} />
                </span>
              }
              title="Bank transfer"
              subtitle="Available at checkout. Account details appear when you pay."
            />
          </ListGroup>
        </section>
      </div>
    </PageLayout>
  );
}

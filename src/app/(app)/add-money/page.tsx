import { CopyButton } from '@/components/ui/copy-button';
import { Card } from '@/components/ui/card';
import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { PageHeader } from '@/components/ui/page-header';

const account = {
  name: 'Spurs Pay account',
  bank: 'Spurs Bank',
  number: '9901234567',
};

export default function AddMoneyPage() {
  return (
    <div className="space-y-6 pt-2">
      <PageHeader title="Add money" description="Use your personal Spurs Pay account to fund your wallet." />

      <Card className="p-4">
        <div className="space-y-4">
          <div>
            <p className="type-body-sm text-muted">Account name</p>
            <p className="type-body-strong mt-1">{account.name}</p>
          </div>
          <div>
            <p className="type-body-sm text-muted">Bank</p>
            <p className="type-body-strong mt-1">{account.bank}</p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-control bg-sunken p-3">
            <div>
              <p className="type-body-sm text-muted">Account number</p>
              <p className="type-body-strong mt-1">{account.number}</p>
            </div>
            <CopyButton value={account.number} label="Copy account number" />
          </div>
        </div>
      </Card>

      <ListGroup>
        <ListRow title="Transfer from your bank app" subtitle="Only send to your own Spurs Pay account." />
        <ListRow title="Arrival time" subtitle="Usually within 2 to 5 minutes." />
        <ListRow title="Fees" subtitle="No fee for standard bank transfer." />
      </ListGroup>
    </div>
  );
}

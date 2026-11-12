import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatNaira } from '@/lib/money';

const ACTIONS = ['Send', 'Request', 'Scan', 'Add money'] as const;

export default function HomePage() {
  return (
    <div className="space-y-6 pt-2">
      <Card className="p-6">
        <p className="text-sm text-muted">Balance</p>
        <p className="amount mt-1 text-4xl font-bold">{formatNaira(0n)}</p>
      </Card>

      <div className="grid grid-cols-4 gap-3">
        {ACTIONS.map((action) => (
          <Button key={action} variant="secondary" disabled className="h-16 flex-col px-1 text-xs">
            {action}
          </Button>
        ))}
      </div>

      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="mb-3 text-base font-semibold">
          Recent activity
        </h2>
        <Card className="p-6 text-sm text-muted">No activity yet. Add money to get started.</Card>
      </section>
    </div>
  );
}

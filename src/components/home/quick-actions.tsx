import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';

export function QuickActions({ sendHref, setupIncomplete }: { sendHref: string; setupIncomplete: boolean }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Link href={sendHref} className={buttonClasses('primary', 'lg')}>
          Send money
        </Link>
        <Link href="/add-money" className={buttonClasses('secondary', 'lg')}>
          Add money
        </Link>
      </div>
      {setupIncomplete && (
        <p className="type-body-sm text-center text-muted">Set up your tag and PIN to send money.</p>
      )}
    </div>
  );
}

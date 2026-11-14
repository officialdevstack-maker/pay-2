import { Check, Clock, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type Status = 'success' | 'pending' | 'failed';

const config = {
  success: { label: 'Completed', icon: Check, tone: 'bg-success-soft text-success' },
  pending: { label: 'Processing', icon: Clock, tone: 'bg-warning-soft text-foreground' },
  failed: { label: 'Failed', icon: X, tone: 'bg-danger-soft text-danger' },
} as const;

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const { label, icon: Icon, tone } = config[status];
  return (
    <span
      className={cn(
        'type-caption inline-flex items-center gap-1 rounded-full px-2 py-1',
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" size={16} strokeWidth={1.75} />
      {label}
    </span>
  );
}

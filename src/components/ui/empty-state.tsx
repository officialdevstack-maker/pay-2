import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, children, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-8 text-center', className)}>
      <Icon aria-hidden="true" size={24} strokeWidth={1.75} className="text-muted" />
      <p className="type-body">{children}</p>
      {action ? <div className="type-body-sm font-semibold text-primary">{action}</div> : null}
    </div>
  );
}

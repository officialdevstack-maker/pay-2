import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'info' | 'warning' | 'danger';

const tones = {
  info: { box: 'bg-primary-soft', icon: Info, role: 'status' as const },
  warning: { box: 'bg-warning-soft', icon: TriangleAlert, role: 'status' as const },
  danger: { box: 'bg-danger-soft', icon: CircleAlert, role: 'alert' as const },
};

export interface BannerProps {
  tone?: Tone;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Banner({ tone = 'info', children, action, className }: BannerProps) {
  const { box, icon: Icon, role } = tones[tone];
  return (
    <div role={role} className={cn('flex items-start gap-3 rounded-control px-4 py-3', box, className)}>
      <Icon aria-hidden="true" size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <p className="type-body-sm flex-1">{children}</p>
      {action ? <div className="type-body-sm shrink-0 font-semibold text-primary">{action}</div> : null}
    </div>
  );
}

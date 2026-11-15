import Link from 'next/link';
import { cn } from '@/lib/cn';

export interface SegmentItem {
  label: string;
  href: string;
  active: boolean;
}

export function Segmented({ label, items }: { label: string; items: SegmentItem[] }) {
  return (
    <nav aria-label={label} className="max-w-full overflow-x-auto">
      <div className="inline-flex rounded-control bg-sunken p-1">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            aria-current={item.active ? 'page' : undefined}
            className={cn(
              'type-body-sm inline-flex h-9 shrink-0 items-center rounded-lg border px-3 font-medium transition duration-press',
              item.active ? 'border-border bg-surface' : 'border-transparent text-muted',
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
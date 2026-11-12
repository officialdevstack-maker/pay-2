import Link from 'next/link';
import { cn } from '@/lib/cn';

const NAV = [
  { label: 'Home', href: '/', ready: true },
  { label: 'Pay', href: '/pay', ready: false },
  { label: 'Activity', href: '/activity', ready: false },
  { label: 'Settings', href: '/settings', ready: false },
] as const;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pt-[env(safe-area-inset-top)]">
      <header className="flex h-14 items-center justify-between px-5">
        <span className="text-lg font-bold tracking-tight">Spurs Pay</span>
      </header>

      <main className="flex-1 px-5 pb-28">{children}</main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-md justify-around border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        {NAV.map((item) =>
          item.ready ? (
            <Link
              key={item.label}
              href={item.href}
              aria-current="page"
              className="flex h-16 flex-1 items-center justify-center text-sm font-semibold text-primary"
            >
              {item.label}
            </Link>
          ) : (
            <span
              key={item.label}
              aria-disabled="true"
              className={cn(
                'flex h-16 flex-1 items-center justify-center text-sm text-muted opacity-60',
              )}
            >
              {item.label}
            </span>
          ),
        )}
      </nav>
    </div>
  );
}

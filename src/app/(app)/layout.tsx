import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { requireUser } from '@/modules/identity';

const NAV = [
  { label: 'Home', href: '/', ready: true },
  { label: 'Pay', href: '/pay', ready: false },
  { label: 'Activity', href: '/activity', ready: false },
  { label: 'Settings', href: '/settings', ready: false },
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pt-[env(safe-area-inset-top)]">
      <header className="flex h-14 items-center justify-between px-5">
        <span className="text-lg font-bold tracking-tight">Spurs Pay</span>
        <div className="flex items-center gap-3">
          <span className="max-w-32 truncate text-sm text-muted">{user.name ?? user.email}</span>
          <form action="/auth/logout" method="post">
            <Button type="submit" variant="ghost" className="h-10 px-3 text-sm text-primary">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      {!user.emailVerified && (
        <div role="status" className="mx-5 mb-2 rounded-control bg-primary-soft px-4 py-3 text-sm">
          Verify your email to send money.
        </div>
      )}

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

import { cookies } from 'next/headers';
import { BottomNav } from '@/components/shell/app-nav';
import { ShellFrame } from '@/components/shell/shell-frame';
import { Sidebar } from '@/components/shell/sidebar';
import { Banner } from '@/components/ui/banner';
import { BUILT_NAV, NAV_COOKIE } from '@/config/nav';
import { env } from '@/env';
import { cn } from '@/lib/cn';
import { requireUser } from '@/modules/identity';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const collapsed = (await cookies()).get(NAV_COOKIE)?.value === 'collapsed';
  const accountsUrl = new URL(env.ACCOUNTS_ISSUER).origin;
  const hasBottomNav = BUILT_NAV.length > 1;

  return (
    <ShellFrame initialCollapsed={collapsed}>
      <a
        href="#main"
        className="type-body-sm sr-only font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-30 focus:rounded-control focus:bg-surface focus:px-4 focus:py-3 focus:text-primary"
      >
        Skip to content
      </a>

      <Sidebar
        account={{
          label: user.name ?? user.email ?? 'Your account',
          email: user.name ? user.email : undefined,
          seed: user.sub,
        }}
      />

      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pt-[env(safe-area-inset-top)] md:max-w-[560px] md:pt-8 lg:max-w-[904px]">
        <header className="flex h-14 items-center px-5 md:hidden">
          <span className="text-lg font-bold tracking-tight">Spurs Pay</span>
        </header>

        {!user.emailVerified && (
          <div className="mb-2 px-5 md:px-6">
            <Banner tone="info" action={<a href={accountsUrl}>Verify</a>}>
              Verify your email to send money.
            </Banner>
          </div>
        )}

        <main id="main" className={cn('flex-1 px-5 md:px-6', hasBottomNav ? 'pb-28 md:pb-8' : 'pb-8')}>
          {children}
        </main>
      </div>

      <BottomNav />
    </ShellFrame>
  );
}

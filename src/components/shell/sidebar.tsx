'use client';

import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { BUILT_NAV, isNavActive } from '@/config/nav';
import { cn } from '@/lib/cn';
import { NAV_ICONS } from './app-nav';
import { useSidebar } from './shell-frame';

export interface SidebarAccount {
  label: string;
  /** Shown under the name. Omit when the label already is the email. */
  email?: string;
  seed: string;
}

/** Desktop rail (768 and up). Hidden on mobile, where the tab bar takes over. */
export function Sidebar({ account }: { account: SidebarAccount }) {
  const { collapsed, toggle } = useSidebar();
  const pathname = usePathname();
  const hint = (text: string) => (collapsed ? text : undefined);

  return (
    <aside
      id="sidebar"
      className={cn(
        'fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-border bg-surface px-3 pb-4 pt-3 transition-[width] duration-sheet ease-enter md:flex',
        collapsed ? 'w-[72px]' : 'w-60',
      )}
    >
      <div className={cn('flex h-14 items-center gap-2', collapsed ? 'justify-center' : 'pl-0 pr-1')}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="sidebar"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition duration-press hover:bg-sunken active:bg-sunken"
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden="true" size={20} strokeWidth={1.75} />
          ) : (
            <PanelLeftClose aria-hidden="true" size={20} strokeWidth={1.75} />
          )}
        </button>
        {collapsed ? null : <span className="truncate text-lg font-bold tracking-tight">Spurs Pay</span>}
      </div>

      <nav aria-label="Main" className="mt-2">
        <ul className="space-y-1">
          {BUILT_NAV.map((item) => {
            const Icon = NAV_ICONS[item.icon];
            const active = isNavActive(pathname, item);
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  title={hint(item.label)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'type-body-strong flex h-11 items-center gap-3 rounded-control transition duration-press',
                    collapsed ? 'justify-center' : 'px-3',
                    active ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-sunken',
                  )}
                >
                  <Icon aria-hidden="true" size={20} strokeWidth={1.75} className="shrink-0" />
                  <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto space-y-1 border-t border-border pt-3">
        <Link
          href="/settings"
          title={hint(account.label)}
          aria-label={collapsed ? `${account.label}, open settings` : undefined}
          className={cn(
            'flex h-14 items-center gap-3 rounded-control transition duration-press hover:bg-sunken',
            collapsed ? 'justify-center' : 'px-3',
          )}
        >
          <Avatar name={account.label} seed={account.seed} />
          {collapsed ? null : (
            <span className="min-w-0">
              <span className="type-body-strong block truncate">{account.label}</span>
              {account.email ? <span className="type-caption block truncate text-muted">{account.email}</span> : null}
            </span>
          )}
        </Link>

        <form action="/auth/logout" method="post">
          <Button
            type="submit"
            variant="ghost"
            title={hint('Sign out')}
            className={cn('w-full gap-3', collapsed ? 'px-0' : 'justify-start px-3')}
          >
            <LogOut aria-hidden="true" size={20} strokeWidth={1.75} className="shrink-0" />
            <span className={cn(collapsed && 'sr-only')}>Sign out</span>
          </Button>
        </form>
      </div>
    </aside>
  );
}

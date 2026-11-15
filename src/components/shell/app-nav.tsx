'use client';

import { Clock, House, Settings, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BUILT_NAV, isNavActive, type NavIcon } from '@/config/nav';
import { cn } from '@/lib/cn';

export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  home: House,
  clock: Clock,
  settings: Settings,
};

/** Mobile tab bar. Renders only once there is more than one built route. */
export function BottomNav() {
  const pathname = usePathname();
  if (BUILT_NAV.length < 2) return null;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-md border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {BUILT_NAV.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        const active = isNavActive(pathname, item);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'type-caption flex h-16 flex-1 flex-col items-center justify-center gap-1',
              active ? 'text-primary' : 'text-muted',
            )}
          >
            <Icon aria-hidden="true" size={24} strokeWidth={1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export type NavIcon = 'home' | 'send' | 'clock' | 'settings';

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  /** Flip to true when the route ships. Unbuilt routes are hidden, never greyed out. */
  ready: boolean;
  /** Extra path prefixes that keep this item highlighted. */
  also?: readonly string[];
}

export const NAV: readonly NavItem[] = [
  { label: 'Home', href: '/', icon: 'home', ready: true, also: ['/add-money'] },
  { label: 'Pay', href: '/pay', icon: 'send', ready: false },
  { label: 'Activity', href: '/activity', icon: 'clock', ready: true },
  { label: 'Settings', href: '/settings', icon: 'settings', ready: true },
];

export const BUILT_NAV = NAV.filter((item) => item.ready);

/** Cookie holding the sidebar state, so the server can render the right width with no flash. */
export const NAV_COOKIE = 'spurs_pay_nav';

export function isNavActive(pathname: string, item: NavItem): boolean {
  const hit = (path: string) =>
    path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
  return hit(item.href) || (item.also?.some(hit) ?? false);
}

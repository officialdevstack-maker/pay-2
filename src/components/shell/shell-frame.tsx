'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { NAV_COOKIE } from '@/config/nav';
import { cn } from '@/lib/cn';

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

export function useSidebar() {
  const state = useContext(SidebarContext);
  if (!state) throw new Error('useSidebar must be used within ShellFrame.');
  return state;
}

export function ShellFrame({ initialCollapsed, children }: { initialCollapsed: boolean; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${NAV_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax${
      window.location.protocol === 'https:' ? '; secure' : ''
    }`;
  }

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      <div
        className={cn(
          'min-h-dvh transition-[padding] duration-sheet ease-enter',
          collapsed ? 'md:pl-[72px]' : 'md:pl-60',
        )}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

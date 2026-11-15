import type { ReactNode } from 'react';

export function PageLayout({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="pt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
      <div>{children}</div>
      {aside ? (
        <aside aria-label="More information" className="hidden space-y-4 lg:block">
          {aside}
        </aside>
      ) : null}
    </div>
  );
}

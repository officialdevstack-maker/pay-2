import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

export function AsideCard({
  title,
  action,
  children,
}: {
  title: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="space-y-3 p-5">
      <h2 className="type-body-strong">{title}</h2>
      <p className="type-body-sm text-muted">{children}</p>
      <div className="type-body-sm font-semibold text-primary">{action}</div>
    </Card>
  );
}

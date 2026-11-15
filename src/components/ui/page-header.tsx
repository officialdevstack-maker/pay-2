import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  back,
}: {
  title: string;
  description?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6 space-y-2">
      {back ? (
        <Link href={back.href} className="type-body-sm -ml-2 inline-flex h-11 items-center gap-1 px-2 font-medium text-primary">
          <ChevronLeft aria-hidden="true" size={20} strokeWidth={1.75} />
          {back.label}
        </Link>
      ) : null}
      <h1 className="type-title">{title}</h1>
      {description ? <p className="type-body-sm text-muted">{description}</p> : null}
    </header>
  );
}
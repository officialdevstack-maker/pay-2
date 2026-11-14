import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ListRowProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}

const base =
  'grid min-h-14 w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-left';
const interactive =
  'transition duration-press active:bg-sunken focus-visible:outline-offset-[-2px]';

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  href,
  onClick,
  className,
}: ListRowProps) {
  const content = (
    <>
      <span className="flex items-center">{leading}</span>
      <span className="min-w-0">
        <span className="type-body-strong block truncate">{title}</span>
        {subtitle ? <span className="type-body-sm block truncate text-muted">{subtitle}</span> : null}
      </span>
      <span className="flex items-center justify-end text-right">{trailing}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cn(base, interactive, className)}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, interactive, className)}>
        {content}
      </button>
    );
  }
  return <div className={cn(base, className)}>{content}</div>;
}

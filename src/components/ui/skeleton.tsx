import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { ListGroup } from './list-group';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} aria-hidden="true" className={cn('animate-skeleton rounded-control bg-sunken', className)} />;
}

export function BalanceSkeleton() {
  return (
    <div className="space-y-3 p-6" role="status" aria-label="Loading balance">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-10 w-48" />
    </div>
  );
}

export function ListRowSkeleton() {
  return (
    <div className="grid min-h-14 grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3">
      <Skeleton className="size-10 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-5 w-16" />
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ListGroup role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <ListRowSkeleton key={index} />
      ))}
    </ListGroup>
  );
}

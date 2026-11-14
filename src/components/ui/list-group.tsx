import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Card } from './card';

export function ListGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <Card className={cn('divide-y divide-border overflow-hidden', className)} {...props} />;
}

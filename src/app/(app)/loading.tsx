import { ListSkeleton, Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="pt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
      <div className="space-y-6">
        <ListSkeleton />
      </div>
      <div className="hidden space-y-4 lg:block">
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}

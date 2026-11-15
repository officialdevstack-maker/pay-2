import { ListSkeleton, Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="pt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
      <div className="space-y-6">
        <Skeleton className="h-14 rounded-full" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
        <div className="grid grid-cols-4 gap-x-2 gap-y-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex flex-col items-center gap-2">
              <Skeleton className="size-12 rounded-full" />
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
        <ListSkeleton />
      </div>
      <div className="hidden space-y-4 lg:block">
        <Skeleton className="h-32" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}

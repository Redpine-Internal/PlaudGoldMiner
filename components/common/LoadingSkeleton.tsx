import React from 'react';
import { cn } from '@/lib/utils';

const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
    return (
        <div
            className={cn("animate-pulse rounded-md bg-muted", className)}
            {...props}
        />
    )
}

export const ConversationCardSkeleton = () => {
  return (
    <div className='p-4 border border-border bg-sidebar rounded-lg'>
      <div className="flex justify-between items-start">
        <Skeleton className="h-6 w-3/4 mb-2" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full mt-2" />
      <Skeleton className="h-4 w-5/6 mt-1" />
      <div className="flex justify-between items-center mt-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-5 w-20 rounded-md" />
      </div>
    </div>
  );
};

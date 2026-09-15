import { cn } from '@/lib/index';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-accent motion-reduce:animate-none', className)}
      {...props}
    />
  );
}

export { Skeleton };

import { PackageOpen, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Skeleton } from './ui/skeleton';

export function OrderTableLoading() {
  return (
    <output className="flex flex-1 flex-col gap-3 px-4 py-5" aria-label="Loading orders">
      <Skeleton className="h-10" />
      <Skeleton className="h-8 w-2/3" />
      {[0, 1, 2].map((index) => (
        <Skeleton
          key={index}
          className="h-[174px] rounded-lg border border-border bg-card"
          style={{ animationDelay: `${index * 90}ms` }}
        />
      ))}
    </output>
  );
}

export function OrderTableEmpty({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
      <div className="max-w-[290px]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-[0_1px_1px_rgba(0,0,0,0.04)]">
          <PackageOpen className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-heading font-semibold tracking-[-0.4px] text-foreground">
          Your order desk is ready
        </h2>
        {children ?? (
          <p className="mt-2 text-body leading-6 text-muted-foreground">
            Open Amazon’s Returns & Orders page, then choose{' '}
            <strong className="font-semibold text-foreground">Save Order</strong> on any order card.
          </p>
        )}
        <div className="mx-auto mt-5 flex items-center justify-center gap-2 font-mono text-micro font-medium uppercase tracking-[0.12em] text-muted-foreground">
          <span className="h-px w-6 bg-border" />
          Saved locally first
          <span className="h-px w-6 bg-border" />
        </div>
      </div>
    </div>
  );
}

interface OrderTableNoResultsProps {
  searchQuery: string;
  onClearSearch: () => void;
}

export function OrderTableNoResults({ searchQuery, onClearSearch }: OrderTableNoResultsProps) {
  return (
    <Card className="min-h-56 items-center justify-center gap-0 border-dashed p-6 text-center shadow-none">
      <div className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground">
        <Search className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="mt-3 text-body font-medium text-foreground">No orders found</p>
      <p className="mt-1 max-w-56 text-caption leading-5 text-muted-foreground">
        Try another search or choose a different status.
      </p>
      {searchQuery ? (
        <Button size="sm" variant="secondary" onClick={onClearSearch} className="mt-4">
          Clear search
        </Button>
      ) : null}
    </Card>
  );
}

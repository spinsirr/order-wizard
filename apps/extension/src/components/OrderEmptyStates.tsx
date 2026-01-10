import { Package, Search } from 'lucide-react';
import { Button } from './ui/button';

export function OrderTableLoading() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="text-muted-foreground">Loading orders...</div>
    </div>
  );
}

export function OrderTableEmpty() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <Package className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden="true" />
      <div className="mb-2 text-lg font-semibold">No orders saved yet</div>
      <p className="max-w-sm text-sm text-muted-foreground">
        Visit Amazon order history and click "Save Order" in the extension toolbar to populate
        your workspace.
      </p>
    </div>
  );
}

interface OrderTableNoResultsProps {
  searchQuery: string;
  onClearSearch: () => void;
}

export function OrderTableNoResults({ searchQuery, onClearSearch }: OrderTableNoResultsProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-muted/60 bg-muted/10 p-8 text-center">
      <Search className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">No matching orders</p>
        <p className="text-sm text-muted-foreground">
          Try adjusting your search or clearing the filter to see more results.
        </p>
      </div>
      {searchQuery ? (
        <Button
          size="sm"
          variant="tonal"
          onClick={onClearSearch}
          className="gap-1.5"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          Clear search
        </Button>
      ) : null}
    </div>
  );
}

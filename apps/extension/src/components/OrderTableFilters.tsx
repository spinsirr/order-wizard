import { Search } from 'lucide-react';
import { OrderStatus, ORDER_STATUS_LABELS } from '@/types';
import type { StatusFilter, OrderSortOption } from '@/utils/orderFilters';

const STATUS_SEQUENCE = Object.values(OrderStatus);

interface OrderTableFiltersProps {
  searchQuery: string;
  statusFilter: StatusFilter;
  sortOption: OrderSortOption;
  onSearchChange: (query: string) => void;
  onStatusFilterChange: (status: StatusFilter) => void;
  onSortOptionChange: (option: OrderSortOption) => void;
}

export function OrderTableFilters({
  searchQuery,
  statusFilter,
  sortOption,
  onSearchChange,
  onStatusFilterChange,
  onSortOptionChange,
}: OrderTableFiltersProps) {
  return (
    <div className="flex flex-col gap-3 px-1 md:flex-row md:items-end md:justify-between md:gap-3 md:px-0">
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 md:w-auto md:flex-none">
        <label className="flex w-full flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
          Status
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}
            className="w-full whitespace-nowrap rounded-2xl border border-transparent bg-card px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 sm:text-sm"
          >
            <option value="all">All statuses</option>
            {STATUS_SEQUENCE.map((statusOption) => (
              <option key={statusOption} value={statusOption}>
                {ORDER_STATUS_LABELS[statusOption]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex w-full flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
          Sort By
          <select
            value={sortOption}
            onChange={(event) => onSortOptionChange(event.target.value as OrderSortOption)}
            className="w-full whitespace-nowrap rounded-2xl border border-transparent bg-card px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 sm:text-sm"
          >
            <option value="updated-desc">Updated: Newest</option>
            <option value="updated-asc">Updated: Oldest</option>
            <option value="date-desc">Order Date: Newest</option>
            <option value="date-asc">Order Date: Oldest</option>
          </select>
        </label>
      </div>

      <div className="relative w-full md:flex-1 md:min-w-[240px] md:max-w-none">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="text"
          placeholder="Search by order #, product name, or price..."
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          className="w-full rounded-2xl border border-transparent bg-card py-2.5 pl-11 pr-4 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
        />
      </div>
    </div>
  );
}

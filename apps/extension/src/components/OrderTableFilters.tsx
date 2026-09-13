import { ListFilter, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OrderStatus } from '@/types';
import type { StatusFilter } from '@/utils/orderFilters';

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: OrderStatus.Uncommented, label: 'Pending' },
  { value: OrderStatus.Commented, label: 'Commented' },
  { value: OrderStatus.CommentRevealed, label: 'Revealed' },
  { value: OrderStatus.Reimbursed, label: 'Reimbursed' },
];

interface OrderTableFiltersProps {
  searchQuery: string;
  statusFilter: StatusFilter;
  onSearchChange: (query: string) => void;
  onStatusFilterChange: (status: StatusFilter) => void;
}

export function OrderTableFilters({
  searchQuery,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
}: OrderTableFiltersProps) {
  return (
    <div className="space-y-2.5">
      <div className="relative">
        <Label htmlFor="order-search" className="sr-only">
          Search orders
        </Label>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="order-search"
          name="order-search"
          type="search"
          placeholder="Search product, order number, or note…"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          autoComplete="off"
          className="h-9 bg-card pl-10 shadow-none placeholder:text-faint"
        />
      </div>

      <Label htmlFor="order-status-filter" className="sr-only">
        Filter by order status
      </Label>
      <Select
        value={statusFilter}
        onValueChange={(value) => onStatusFilterChange(value as StatusFilter)}
      >
        <SelectTrigger
          id="order-status-filter"
          size="sm"
          className="w-[152px] bg-card pl-2.5 text-caption shadow-none"
        >
          <ListFilter className="size-3.5" aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start" className="min-w-40">
          {FILTER_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-caption">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

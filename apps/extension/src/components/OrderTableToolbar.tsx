import {
  ArrowUpDown,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ExportFormat } from '@/utils/orderExport';
import type { OrderSortOption } from '@/utils/orderFilters';

const EXPORT_OPTIONS: { format: ExportFormat; label: string; icon: typeof FileText }[] = [
  { format: 'csv', label: 'CSV', icon: FileText },
  { format: 'xlsx', label: 'Excel workbook', icon: FileSpreadsheet },
  { format: 'pdf', label: 'PDF', icon: FileText },
];

const SORT_OPTIONS: { value: OrderSortOption; label: string }[] = [
  { value: 'created-desc', label: 'Recent' },
  { value: 'created-asc', label: 'Oldest' },
  { value: 'date-desc', label: 'Order date ↓' },
  { value: 'date-asc', label: 'Order date ↑' },
];

interface OrderTableToolbarProps {
  displayCount: number;
  selectedCount: number;
  allSelected: boolean;
  someSelected: boolean;
  sortOption: OrderSortOption;
  onToggleSelectAll: (checked: boolean) => void;
  onDeleteSelected: () => void;
  onExport: (format: ExportFormat) => void;
  onSortOptionChange: (option: OrderSortOption) => void;
}

export function OrderTableToolbar({
  displayCount,
  selectedCount,
  allSelected,
  someSelected,
  sortOption,
  onToggleSelectAll,
  onDeleteSelected,
  onExport,
  onSortOptionChange,
}: OrderTableToolbarProps) {
  const hasSelection = selectedCount > 0;
  const checked = allSelected ? true : someSelected ? 'indeterminate' : false;

  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox
          id="select-visible-orders"
          checked={checked}
          onCheckedChange={(next) => onToggleSelectAll(next === true)}
          aria-label="Select all visible orders"
        />
        <Label htmlFor="select-visible-orders" className="min-w-0 truncate text-caption">
          {hasSelection
            ? `${selectedCount} selected`
            : `${displayCount} order${displayCount === 1 ? '' : 's'}`}
        </Label>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {hasSelection ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDeleteSelected}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        ) : (
          <Select
            value={sortOption}
            onValueChange={(value) => onSortOptionChange(value as OrderSortOption)}
          >
            <SelectTrigger
              size="sm"
              aria-label="Sort orders"
              className="w-[120px] bg-card pl-2.5 text-caption shadow-none"
            >
              <ArrowUpDown className="size-3.5" aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="text-caption">
              <Download aria-hidden="true" />
              Export
              <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {EXPORT_OPTIONS.map(({ format, label, icon: Icon }) => (
              <DropdownMenuItem key={format} onSelect={() => onExport(format)}>
                <Icon aria-hidden="true" />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

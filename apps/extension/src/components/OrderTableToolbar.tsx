import { CheckCircle2, Circle, ClipboardList, Download, Minus, Trash2 } from 'lucide-react';
import { cn } from '@/utils';
import { Button } from './ui/button';

interface OrderTableToolbarProps {
  displayCount: number;
  selectedCount: number;
  allSelected: boolean;
  someSelected: boolean;
  onToggleSelectAll: (checked: boolean) => void;
  onDeleteSelected: () => void;
  onExport: () => void;
}

export function OrderTableToolbar({
  displayCount,
  selectedCount,
  allSelected,
  someSelected,
  onToggleSelectAll,
  onDeleteSelected,
  onExport,
}: OrderTableToolbarProps) {
  const hasSelection = selectedCount > 0;

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="px-1 text-sm text-muted-foreground sm:px-0">
        {selectedCount > 0
          ? `${selectedCount} order${selectedCount === 1 ? '' : 's'} selected`
          : `${displayCount} saved order${displayCount === 1 ? '' : 's'}`}
      </div>
      <div className="flex flex-wrap items-center gap-2.5 px-1 sm:px-0">
        <div className="flex w-full items-center gap-2 justify-between sm:w-auto sm:flex-1 sm:flex-row-reverse sm:gap-3">
          <button
            type="button"
            className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
            aria-pressed={allSelected || someSelected}
            onClick={() => onToggleSelectAll(!allSelected)}
          >
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full border transition',
                allSelected
                  ? 'bg-primary text-primary-foreground border-primary'
                  : someSelected
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-muted text-muted-foreground',
              )}
            >
              {allSelected ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              ) : someSelected ? (
                <Minus className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
            Select all
          </button>
          <span
            className={cn(
              'flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-opacity duration-150',
              hasSelection ? 'opacity-100 visible' : 'opacity-0 invisible',
            )}
            aria-hidden={!hasSelection}
          >
            <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
            {selectedCount} selected
          </span>
        </div>
        <Button
          onClick={onDeleteSelected}
          size="sm"
          variant="destructive"
          disabled={selectedCount === 0}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete Selected
        </Button>
        <Button onClick={onExport} size="sm" variant="tonal">
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </Button>
      </div>
    </div>
  );
}

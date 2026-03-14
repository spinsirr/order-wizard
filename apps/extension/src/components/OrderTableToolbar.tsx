import {
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  Minus,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib';
import type { ExportFormat } from '@/utils/orderExport';
import { Button } from './ui/button';

const EXPORT_OPTIONS: { format: ExportFormat; label: string; icon: typeof FileText }[] = [
  { format: 'csv', label: 'CSV', icon: FileText },
  { format: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet },
  { format: 'pdf', label: 'PDF', icon: FileText },
];

interface OrderTableToolbarProps {
  displayCount: number;
  selectedCount: number;
  allSelected: boolean;
  someSelected: boolean;
  onToggleSelectAll: (checked: boolean) => void;
  onDeleteSelected: () => void;
  onExport: (format: ExportFormat) => void;
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
  const [exportOpen, setExportOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);

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
        <div className="relative" ref={dropdownRef}>
          <Button onClick={() => setExportOpen((prev) => !prev)} size="sm" variant="tonal">
            <Download className="h-4 w-4" aria-hidden="true" />
            Export
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', exportOpen && 'rotate-180')}
              aria-hidden="true"
            />
          </Button>
          {exportOpen && (
            <div className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-surface-container shadow-lg">
              {EXPORT_OPTIONS.map(({ format, label, icon: Icon }) => (
                <button
                  key={format}
                  type="button"
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
                  onClick={() => {
                    onExport(format);
                    setExportOpen(false);
                  }}
                >
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

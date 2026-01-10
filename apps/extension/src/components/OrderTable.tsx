import { useEffect, useState, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  CheckCircle2,
  Circle,
  ClipboardList,
  Download,
  Eye,
  Minus,
  MessageCircle,
  Package,
  Search,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { useOrders, useUpdateOrderStatus, useDeleteOrders } from '@/hooks/useOrders';
import { useOrderUIStore, filterAndSortOrders, exportOrdersToCSV } from '@/store/orderStore';
import type { OrderSortOption, StatusFilter } from '@/store/orderStore';
import { OrderStatus, ORDER_STATUS_LABELS } from '@/types';
import { cn } from '@/utils';
import { Button } from './ui/button';
import { Card, CardTitle } from './ui/card';

const FALLBACK_COLORS = [
  'bg-indigo-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-sky-500',
  'bg-purple-500',
  'bg-cyan-500',
  'bg-fuchsia-500',
] as const;

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
};

const getFallbackColor = (key: string): (typeof FALLBACK_COLORS)[number] => {
  const hash = Math.abs(hashString(key));
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
};

const statusConfig: Record<
  OrderStatus,
  {
    Icon: LucideIcon;
    activeButtonClass: string;
    activeIconClass: string;
  }
> = {
  [OrderStatus.Uncommented]: {
    Icon: ClipboardList,
    activeButtonClass:
      'bg-indigo-500 text-white border-indigo-500 dark:bg-indigo-400 dark:text-black',
    activeIconClass: 'text-white dark:text-black',
  },
  [OrderStatus.Commented]: {
    Icon: MessageCircle,
    activeButtonClass: 'bg-accent text-accent-foreground border-accent',
    activeIconClass: 'text-accent-foreground',
  },
  [OrderStatus.CommentRevealed]: {
    Icon: Eye,
    activeButtonClass: 'bg-primary text-primary-foreground border-primary',
    activeIconClass: 'text-primary-foreground',
  },
  [OrderStatus.Reimbursed]: {
    Icon: BadgeCheck,
    activeButtonClass:
      'bg-emerald-500 text-white border-emerald-500 dark:bg-emerald-400 dark:text-black',
    activeIconClass: 'text-white dark:text-black',
  },
};

const CARD_CONTENT_WIDTH = 'mx-auto w-full max-w-none';
const STATUS_SEQUENCE = Object.values(OrderStatus);

type ConfirmData =
  | { type: 'single'; orderId: string; message: string }
  | { type: 'bulk'; orderIds: string[]; message: string };

export function OrderTable() {
  // TanStack Query hooks
  const { data: orders = [], isLoading } = useOrders();
  const updateStatusMutation = useUpdateOrderStatus();
  const deleteOrdersMutation = useDeleteOrders();

  // UI state from Zustand
  const { searchQuery, statusFilter, sortOption, setSearchQuery, setStatusFilter, setSortOption } =
    useOrderUIStore();

  // Local UI state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmData, setConfirmData] = useState<ConfirmData | null>(null);
  const [imageFailures, setImageFailures] = useState<Set<string>>(new Set());

  // Derived state
  const displayOrders = useMemo(
    () => filterAndSortOrders(orders, searchQuery, statusFilter, sortOption),
    [orders, searchQuery, statusFilter, sortOption]
  );

  // Clean up selected IDs when orders change (remove IDs that no longer exist)
  useEffect(() => {
    const orderIds = new Set(displayOrders.map((o) => o.id));
    setSelectedIds((previous) => {
      const stillValid = [...previous].filter((id) => orderIds.has(id));
      if (stillValid.length === previous.size) {
        return previous;
      }
      return new Set(stillValid);
    });
  }, [displayOrders]);

  const selectedCount = selectedIds.size;
  const allSelected = displayOrders.length > 0 && selectedCount === displayOrders.length;
  const someSelected = selectedCount > 0 && selectedCount < displayOrders.length;
  const hasSelection = selectedCount > 0;

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(displayOrders.map((order) => order.id)) : new Set<string>());
  };

  const toggleSelect = (orderId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedCount === 0) return;
    setConfirmData({
      type: 'bulk',
      orderIds: Array.from(selectedIds),
      message: `Delete ${selectedCount} selected order${selectedCount === 1 ? '' : 's'}?`,
    });
  };

  const handleDeleteSingle = (orderId: string) => {
    setConfirmData({ type: 'single', orderId, message: 'Delete this order?' });
  };

  const handleConfirmDelete = async () => {
    if (!confirmData) return;

    const idsToDelete = confirmData.type === 'bulk' ? confirmData.orderIds : [confirmData.orderId];

    await deleteOrdersMutation.mutateAsync(idsToDelete);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of idsToDelete) {
        next.delete(id);
      }
      return next;
    });
    setConfirmData(null);
  };

  const handleCancelDelete = () => {
    if (deleteOrdersMutation.isPending) return;
    setConfirmData(null);
  };

  const handleExport = () => {
    exportOrdersToCSV(displayOrders);
  };

  const handleImageError = (orderId: string) => {
    setImageFailures((previous) => {
      if (previous.has(orderId)) return previous;
      const next = new Set(previous);
      next.add(orderId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading orders...</div>
      </div>
    );
  }

  if (orders.length === 0) {
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 space-y-5 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="px-1 text-sm text-muted-foreground sm:px-0">
            {selectedCount > 0
              ? `${selectedCount} order${selectedCount === 1 ? '' : 's'} selected`
              : `${displayOrders.length} saved order${displayOrders.length === 1 ? '' : 's'}`}
          </div>
          <div className="flex flex-wrap items-center gap-2.5 px-1 sm:px-0">
            <div className="flex w-full items-center gap-2 justify-between sm:w-auto sm:flex-1 sm:flex-row-reverse sm:gap-3">
              <button
                type="button"
                className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                aria-pressed={allSelected || someSelected}
                onClick={() => toggleSelectAll(!allSelected)}
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
              onClick={handleDeleteSelected}
              size="sm"
              variant="destructive"
              disabled={selectedCount === 0}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete Selected
            </Button>
            <Button onClick={handleExport} size="sm" variant="tonal">
              <Download className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-1 md:flex-row md:items-end md:justify-between md:gap-3 md:px-0">
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 md:w-auto md:flex-none">
            <label className="flex w-full flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
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
                onChange={(event) => setSortOption(event.target.value as OrderSortOption)}
                className="w-full whitespace-nowrap rounded-2xl border border-transparent bg-card px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 sm:text-sm"
              >
                <option value="date-desc">Date: Newest first</option>
                <option value="date-asc">Date: Oldest first</option>
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
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-2xl border border-transparent bg-card py-2.5 pl-11 pr-4 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4">
        {displayOrders.length === 0 ? (
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
                onClick={() => setSearchQuery('')}
                className="gap-1.5"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                Clear search
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {displayOrders.map((order) => {
              const isSelected = selectedIds.has(order.id);

              return (
                <Card
                  key={order.id}
                  elevation={isSelected ? 'high' : 'medium'}
                  className={cn(
                    'relative flex h-full w-full flex-col overflow-hidden border border-border bg-card text-foreground shadow-sm transition-shadow duration-200',
                    isSelected
                      ? 'ring-2 ring-primary/40 shadow-lg'
                      : 'hover:shadow-[0_10px_20px_rgba(15,23,42,0.12)]',
                  )}
                >
                  <div
                    className={cn(
                      CARD_CONTENT_WIDTH,
                      'border-b border-border bg-muted/60 px-6 py-3',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground/80">Order #</span>
                        <span className="font-medium text-foreground">{order.orderNumber}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground/80">Total</span>
                        <span className="font-medium text-foreground">{order.price}</span>
                      </div>
                      <button
                        type="button"
                        className="ml-auto flex items-center gap-2 text-[11px] font-medium normal-case text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        aria-pressed={isSelected}
                        onClick={() => toggleSelect(order.id)}
                      >
                        <span
                          className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-full border transition',
                            isSelected
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'border-border bg-muted text-muted-foreground',
                          )}
                        >
                          {isSelected ? (
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Circle className="h-4 w-4" aria-hidden="true" />
                          )}
                        </span>
                        Select
                      </button>
                    </div>
                  </div>

                  <div
                    className={cn(
                      CARD_CONTENT_WIDTH,
                      'grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 px-6 py-4 md:gap-6',
                    )}
                  >
                    <div className="flex justify-start">
                      <div className="h-24 w-24 overflow-hidden rounded-2xl border border-border bg-muted sm:h-28 sm:w-28 md:h-32 md:w-32">
                        {order.productImage && !imageFailures.has(order.id) ? (
                          <img
                            src={order.productImage}
                            alt={order.productName}
                            className="h-full w-full object-cover"
                            onError={() => handleImageError(order.id)}
                          />
                        ) : (
                          <div
                            className={cn(
                              'flex h-full w-full items-center justify-center text-2xl font-semibold text-white',
                              getFallbackColor(
                                (order.productName || order.orderNumber || order.id || '').trim() ||
                                  order.id,
                              ),
                            )}
                            aria-hidden="true"
                          >
                            {(
                              (order.productName?.trim() || order.orderNumber?.trim() || 'U')[0] ||
                              'U'
                            ).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <CardTitle className="text-sm font-semibold leading-snug text-foreground hover:text-primary md:text-base">
                        {order.productName.length > 80
                          ? `${order.productName.slice(0, 77)}...`
                          : order.productName}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-2 md:gap-3">
                        <div className="flex items-center gap-1.5">
                          {STATUS_SEQUENCE.map((statusOption) => {
                            const { Icon, activeButtonClass, activeIconClass } =
                              statusConfig[statusOption];
                            const isActive = statusOption === order.status;
                            return (
                              <button
                                key={statusOption}
                                type="button"
                                aria-pressed={isActive}
                                title={ORDER_STATUS_LABELS[statusOption]}
                                className={cn(
                                  'flex h-8 w-8 items-center justify-center rounded-full border transition hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                                  isActive
                                    ? activeButtonClass
                                    : 'border-border bg-muted text-muted-foreground hover:border-primary/40',
                                )}
                                onClick={() => {
                                  if (!isActive) {
                                    updateStatusMutation.mutate({ id: order.id, status: statusOption });
                                  }
                                }}
                              >
                                <Icon
                                  className={cn(
                                    'h-4 w-4',
                                    isActive ? activeIconClass : 'text-muted-foreground',
                                  )}
                                  aria-hidden="true"
                                />
                              </button>
                            );
                          })}
                        </div>
                        <span className="text-[11px] text-muted-foreground/80">
                          Placed {order.orderDate}
                        </span>
                        <div className="ml-auto flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const sanitized = order.orderNumber.replace(/\s+/g, '');
                              const url = `https://www.amazon.com/gp/css/order-details?orderID=${encodeURIComponent(sanitized)}`;
                              window.open(url, '_blank', 'noopener');
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary transition hover:bg-primary/15"
                            aria-label="Track order"
                          >
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSingle(order.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-destructive/30 text-destructive transition hover:bg-destructive/10"
                            aria-label="Remove order"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {confirmData ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">{confirmData.message}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {confirmData.type === 'bulk'
                ? 'This action cannot be undone and will remove all selected orders from your list.'
                : 'This action cannot be undone and will remove the order from your list.'}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelDelete}
                disabled={deleteOrdersMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void handleConfirmDelete()}
                disabled={deleteOrdersMutation.isPending}
              >
                {deleteOrdersMutation.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

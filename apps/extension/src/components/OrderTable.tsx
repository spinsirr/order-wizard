import { useMutation } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  useDeleteOrders,
  useOrders,
  useUpdateOrderNote,
  useUpdateOrderStatus,
} from '@/hooks/useOrders';
import { useReturnWarnings } from '@/hooks/useReturnWarnings';
import type { OrderStatus } from '@/types';
import type { ExportFormat } from '@/utils/orderExport';
import { exportOrders } from '@/utils/orderExport';
import type { OrderSortOption, StatusFilter } from '@/utils/orderFilters';
import { filterAndSortOrders } from '@/utils/orderFilters';
import { type ConfirmData, DeleteConfirmModal } from './DeleteConfirmModal';
import { OrderCard } from './OrderCard';
import { OrderTableEmpty, OrderTableLoading, OrderTableNoResults } from './OrderEmptyStates';
import { DEFAULT_STATUS_OPTIONS, OrderStatusSelect } from './OrderStatusSelect';
import { OrderTableFilters } from './OrderTableFilters';
import { OrderTableToolbar } from './OrderTableToolbar';
import { ReturnWarningSummary } from './ReturnWarningSummary';

export function OrderTable({ emptyState }: { emptyState?: ReactNode }) {
  // TanStack Query hooks
  const { data: orders = [], isLoading, error: queryError, refetch } = useOrders();
  const updateStatusMutation = useUpdateOrderStatus();
  const updateNoteMutation = useUpdateOrderNote();
  const deleteOrdersMutation = useDeleteOrders();
  const { mutate: mutateStatus } = updateStatusMutation;
  const { mutate: mutateNote } = updateNoteMutation;
  const { mutate: mutateDelete, isPending: isDeleting, reset: resetDelete } = deleteOrdersMutation;

  // UI state (local - no need for global store)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOption, setSortOption] = useState<OrderSortOption>(() =>
    new URLSearchParams(window.location.search).get('view') === 'returns'
      ? 'date-asc'
      : 'created-desc',
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmData, setConfirmData] = useState<ConfirmData | null>(null);
  const [imageFailures, setImageFailures] = useState<Set<string>>(new Set());
  const [showingWarnings, setShowingWarnings] = useState(
    () => new URLSearchParams(window.location.search).get('view') === 'returns',
  );
  const returnWarnings = useReturnWarnings(orders);

  // Keep the input responsive; defer the heavy filter/sort pass to a low-priority render.
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const displayOrders = useMemo(
    () =>
      filterAndSortOrders(
        showingWarnings ? orders.filter((order) => returnWarnings.has(order.id)) : orders,
        deferredSearchQuery,
        statusFilter,
        sortOption,
      ),
    [orders, deferredSearchQuery, statusFilter, sortOption, showingWarnings, returnWarnings],
  );

  // Prune selected IDs only when the underlying order set changes, not on every search keystroke.
  useEffect(() => {
    const orderIds = new Set(orders.map((o) => o.id));
    setSelectedIds((previous) => {
      const stillValid = [...previous].filter((id) => orderIds.has(id));
      if (stillValid.length === previous.size) {
        return previous;
      }
      return new Set(stillValid);
    });
  }, [orders]);

  const displayedSelectedCount = useMemo(
    () => displayOrders.reduce((count, order) => count + Number(selectedIds.has(order.id)), 0),
    [displayOrders, selectedIds],
  );
  const allSelected = displayOrders.length > 0 && displayedSelectedCount === displayOrders.length;
  const someSelected = displayedSelectedCount > 0 && !allSelected;

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? new Set(displayOrders.map((order) => order.id)) : new Set<string>());
    },
    [displayOrders],
  );

  const toggleSelect = useCallback((orderId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  }, []);

  const handleDeleteSelected = useCallback(() => {
    const ids = displayOrders.filter((order) => selectedIds.has(order.id)).map((order) => order.id);
    if (ids.length === 0) {
      return;
    }
    setConfirmData({
      type: 'bulk',
      orderIds: ids,
      message: `Delete ${ids.length} selected order${ids.length === 1 ? '' : 's'}?`,
    });
  }, [displayOrders, selectedIds]);

  const handleDeleteSingle = useCallback((orderId: string) => {
    setConfirmData({ type: 'single', orderId, message: 'Delete this order?' });
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!confirmData) {
      return;
    }

    const idsToDelete = confirmData.type === 'bulk' ? confirmData.orderIds : [confirmData.orderId];

    mutateDelete(idsToDelete, {
      onSuccess: () => {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of idsToDelete) {
            next.delete(id);
          }
          return next;
        });
        setConfirmData(null);
      },
    });
  }, [confirmData, mutateDelete]);

  const handleCancelDelete = useCallback(() => {
    if (isDeleting) {
      return;
    }
    setConfirmData(null);
    resetDelete();
  }, [isDeleting, resetDelete]);

  const exportMutation = useMutation({
    mutationFn: (format: ExportFormat) => exportOrders(displayOrders, format),
  });
  const handleExport = exportMutation.mutate;

  const handleImageError = useCallback((orderId: string) => {
    setImageFailures((previous) => {
      if (previous.has(orderId)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(orderId);
      return next;
    });
  }, []);

  const handleStatusChange = useCallback(
    (orderId: string, status: OrderStatus) => {
      mutateStatus({ id: orderId, status });
    },
    [mutateStatus],
  );

  const handleNoteSave = useCallback(
    (orderId: string, note: string) => {
      mutateNote({ id: orderId, note });
    },
    [mutateNote],
  );

  const handleClearSearch = useCallback(() => setSearchQuery(''), []);

  const scrollParentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: displayOrders.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 184,
    overscan: 6,
    gap: 10,
    getItemKey: (index) => displayOrders[index]?.id ?? index,
  });

  if (isLoading) {
    return <OrderTableLoading />;
  }

  if (queryError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {queryError.message}
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (orders.length === 0) {
    return emptyState ?? <OrderTableEmpty />;
  }

  const mutationError =
    updateStatusMutation.error ?? updateNoteMutation.error ?? exportMutation.error;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="sidepanel-controls-enter flex-shrink-0 space-y-2.5 border-b border-border bg-background/95 px-3 pb-2.5 pt-2.5 backdrop-blur-lg">
        <ReturnWarningSummary
          warnings={returnWarnings}
          showingWarnings={showingWarnings}
          onToggle={() => {
            setShowingWarnings(!showingWarnings);
            setSearchQuery('');
            setStatusFilter('all');
            if (!showingWarnings) {
              setSortOption('date-asc');
            }
          }}
        />
        <OrderTableFilters
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          onSearchChange={setSearchQuery}
          onStatusFilterChange={setStatusFilter}
        />

        {mutationError ? (
          <Alert variant="destructive">
            <AlertDescription>{mutationError.message}</AlertDescription>
          </Alert>
        ) : null}
        <OrderTableToolbar
          displayCount={displayOrders.length}
          selectedCount={displayedSelectedCount}
          allSelected={allSelected}
          someSelected={someSelected}
          sortOption={sortOption}
          onToggleSelectAll={toggleSelectAll}
          onDeleteSelected={handleDeleteSelected}
          onExport={handleExport}
          onSortOptionChange={setSortOption}
        />
      </div>

      <div ref={scrollParentRef} className="flex-1 overflow-y-auto px-3 pb-3 pt-2.5">
        {showingWarnings && returnWarnings.size === 0 ? (
          <p className="py-6 text-center text-body text-muted-foreground">
            No orders currently need a return reminder.
          </p>
        ) : displayOrders.length === 0 ? (
          <OrderTableNoResults
            searchQuery={deferredSearchQuery}
            onClearSearch={handleClearSearch}
          />
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
              width: '100%',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const order = displayOrders[virtualRow.index];
              if (!order) {
                return null;
              }
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="sidepanel-order-position"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div
                    className="sidepanel-order-enter"
                    style={{ animationDelay: `${120 + Math.min(virtualRow.index, 6) * 35}ms` }}
                  >
                    <OrderCard
                      order={order}
                      returnWarning={returnWarnings.get(order.id)}
                      isSelected={selectedIds.has(order.id)}
                      hasImageError={imageFailures.has(order.id)}
                      onToggleSelect={toggleSelect}
                      statusControl={
                        <OrderStatusSelect
                          value={order.status}
                          options={DEFAULT_STATUS_OPTIONS}
                          productName={order.productName}
                          onChange={(status) => handleStatusChange(order.id, status)}
                        />
                      }
                      onNoteSave={handleNoteSave}
                      onDelete={handleDeleteSingle}
                      onImageError={handleImageError}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirmData ? (
        <DeleteConfirmModal
          confirmData={confirmData}
          isDeleting={isDeleting}
          error={deleteOrdersMutation.error}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      ) : null}
    </div>
  );
}

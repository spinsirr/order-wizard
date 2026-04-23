import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDeleteOrders, useOrders, useUpdateOrderStatus } from '@/hooks/useOrders';
import type { OrderStatus } from '@/types';
import type { OrderSortOption, StatusFilter } from '@/utils/orderFilters';
import { filterAndSortOrders } from '@/utils/orderFilters';
import type { ExportFormat } from '@/utils/orderExport';
import { exportOrders } from '@/utils/orderExport';
import { type ConfirmData, DeleteConfirmModal } from './DeleteConfirmModal';
import { OrderCard } from './OrderCard';
import { OrderTableEmpty, OrderTableLoading, OrderTableNoResults } from './OrderEmptyStates';
import { OrderTableFilters } from './OrderTableFilters';
import { OrderTableToolbar } from './OrderTableToolbar';

export function OrderTable() {
  // TanStack Query hooks
  const { data: orders = [], isLoading } = useOrders();
  const updateStatusMutation = useUpdateOrderStatus();
  const deleteOrdersMutation = useDeleteOrders();
  const { mutate: mutateStatus } = updateStatusMutation;
  const { mutateAsync: mutateDelete, isPending: isDeleting } = deleteOrdersMutation;

  // UI state (local - no need for global store)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOption, setSortOption] = useState<OrderSortOption>('created-desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmData, setConfirmData] = useState<ConfirmData | null>(null);
  const [imageFailures, setImageFailures] = useState<Set<string>>(new Set());

  // Keep the input responsive; defer the heavy filter/sort pass to a low-priority render.
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const displayOrders = useMemo(
    () => filterAndSortOrders(orders, deferredSearchQuery, statusFilter, sortOption),
    [orders, deferredSearchQuery, statusFilter, sortOption],
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

  const selectedCount = selectedIds.size;
  const allSelected = displayOrders.length > 0 && selectedCount === displayOrders.length;
  const someSelected = selectedCount > 0 && selectedCount < displayOrders.length;

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
    setSelectedIds((current) => {
      if (current.size === 0) return current;
      const ids = Array.from(current);
      setConfirmData({
        type: 'bulk',
        orderIds: ids,
        message: `Delete ${ids.length} selected order${ids.length === 1 ? '' : 's'}?`,
      });
      return current;
    });
  }, []);

  const handleDeleteSingle = useCallback((orderId: string) => {
    setConfirmData({ type: 'single', orderId, message: 'Delete this order?' });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmData) return;

    const idsToDelete = confirmData.type === 'bulk' ? confirmData.orderIds : [confirmData.orderId];

    await mutateDelete(idsToDelete);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of idsToDelete) {
        next.delete(id);
      }
      return next;
    });
    setConfirmData(null);
  }, [confirmData, mutateDelete]);

  const handleCancelDelete = useCallback(() => {
    if (isDeleting) return;
    setConfirmData(null);
  }, [isDeleting]);

  const handleExport = useCallback(
    (format: ExportFormat) => {
      exportOrders(displayOrders, format);
    },
    [displayOrders],
  );

  const handleImageError = useCallback((orderId: string) => {
    setImageFailures((previous) => {
      if (previous.has(orderId)) return previous;
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

  const handleClearSearch = useCallback(() => setSearchQuery(''), []);

  const scrollParentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: displayOrders.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 220,
    overscan: 6,
    gap: 14,
    getItemKey: (index) => displayOrders[index]?.id ?? index,
  });

  if (isLoading) {
    return <OrderTableLoading />;
  }

  if (orders.length === 0) {
    return <OrderTableEmpty />;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 space-y-5 p-3 sm:p-4">
        <OrderTableToolbar
          displayCount={displayOrders.length}
          selectedCount={selectedCount}
          allSelected={allSelected}
          someSelected={someSelected}
          onToggleSelectAll={toggleSelectAll}
          onDeleteSelected={handleDeleteSelected}
          onExport={handleExport}
        />

        <OrderTableFilters
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          sortOption={sortOption}
          onSearchChange={setSearchQuery}
          onStatusFilterChange={setStatusFilter}
          onSortOptionChange={setSortOption}
        />
      </div>

      <div
        ref={scrollParentRef}
        className="flex-1 overflow-y-auto px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4"
      >
        {displayOrders.length === 0 ? (
          <OrderTableNoResults searchQuery={deferredSearchQuery} onClearSearch={handleClearSearch} />
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
              if (!order) return null;
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <OrderCard
                    order={order}
                    isSelected={selectedIds.has(order.id)}
                    hasImageError={imageFailures.has(order.id)}
                    onToggleSelect={toggleSelect}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDeleteSingle}
                    onImageError={handleImageError}
                  />
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
          onConfirm={() => void handleConfirmDelete()}
          onCancel={handleCancelDelete}
        />
      ) : null}
    </div>
  );
}

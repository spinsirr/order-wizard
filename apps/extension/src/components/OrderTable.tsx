import { useEffect, useState, useMemo } from 'react';
import { useOrders, useUpdateOrderStatus, useDeleteOrders } from '@/hooks/useOrders';
import { filterAndSortOrders, exportOrdersToCSV } from '@/utils';
import type { StatusFilter, OrderSortOption } from '@/utils';
import type { OrderStatus } from '@/types';
import { OrderCard } from './OrderCard';
import { OrderTableToolbar } from './OrderTableToolbar';
import { OrderTableFilters } from './OrderTableFilters';
import { DeleteConfirmModal, type ConfirmData } from './DeleteConfirmModal';
import { OrderTableLoading, OrderTableEmpty, OrderTableNoResults } from './OrderEmptyStates';

export function OrderTable() {
  // TanStack Query hooks
  const { data: orders = [], isLoading } = useOrders();
  const updateStatusMutation = useUpdateOrderStatus();
  const deleteOrdersMutation = useDeleteOrders();

  // UI state (local - no need for global store)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOption, setSortOption] = useState<OrderSortOption>('created-desc');
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

  const handleStatusChange = (orderId: string, status: OrderStatus) => {
    updateStatusMutation.mutate({ id: orderId, status });
  };

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

      <div className="flex-1 overflow-y-auto px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4">
        {displayOrders.length === 0 ? (
          <OrderTableNoResults searchQuery={searchQuery} onClearSearch={() => setSearchQuery('')} />
        ) : (
          <div className="flex flex-col gap-3.5">
            {displayOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                isSelected={selectedIds.has(order.id)}
                hasImageError={imageFailures.has(order.id)}
                onToggleSelect={toggleSelect}
                onStatusChange={handleStatusChange}
                onDelete={handleDeleteSingle}
                onImageError={handleImageError}
              />
            ))}
          </div>
        )}
      </div>

      {confirmData ? (
        <DeleteConfirmModal
          confirmData={confirmData}
          isDeleting={deleteOrdersMutation.isPending}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={handleCancelDelete}
        />
      ) : null}
    </div>
  );
}

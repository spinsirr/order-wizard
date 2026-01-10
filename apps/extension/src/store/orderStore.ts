import { create } from 'zustand';
import { orderRepository } from '@/config';
import type { StatusFilter, OrderSortOption } from '@/utils/orderFilters';

// Re-export types and utilities for convenience
export { filterAndSortOrders } from '@/utils/orderFilters';
export { exportOrdersToCSV } from '@/utils/orderExport';
export type { StatusFilter, OrderSortOption } from '@/utils/orderFilters';

interface OrderUIStore {
  searchQuery: string;
  statusFilter: StatusFilter;
  sortOption: OrderSortOption;

  setSearchQuery: (query: string) => void;
  setStatusFilter: (status: StatusFilter) => void;
  setSortOption: (option: OrderSortOption) => void;
  setCurrentUserId: (userId: string | null | undefined) => void;
}

export const useOrderUIStore = create<OrderUIStore>((set) => ({
  searchQuery: '',
  statusFilter: 'all',
  sortOption: 'date-desc',

  setSearchQuery: (query) => set({ searchQuery: query }),
  setStatusFilter: (status) => set({ statusFilter: status }),
  setSortOption: (option) => set({ sortOption: option }),

  setCurrentUserId: (userId) => {
    if ('setCurrentUserId' in orderRepository) {
      (orderRepository as { setCurrentUserId: (id: string | null) => void }).setCurrentUserId(userId ?? null);
    }
  },
}));

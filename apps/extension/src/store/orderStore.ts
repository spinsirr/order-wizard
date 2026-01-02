import { create } from 'zustand';
import type { Order } from '@/types/Order';
import type { OrderStatus } from '@/types/OrderStatus';
import { orderRepository } from '@/config/storage';
import Papa from 'papaparse';
import Fuse from 'fuse.js';

type StatusFilter = OrderStatus | 'all';

type OrderSortOption = 'date-desc' | 'date-asc';

interface OrderStore {
  orders: Order[];
  filteredOrders: Order[];
  searchQuery: string;
  statusFilter: StatusFilter;
  sortOption: OrderSortOption;
  isLoading: boolean;
  error: string | null;

  // Actions
  setCurrentUserId: (userId: string | null | undefined) => void;
  fetchOrders: () => Promise<void>;
  updateOrderStatus: (id: string, status: OrderStatus) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  deleteOrders: (ids: string[]) => Promise<void>;
  exportOrders: () => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (status: StatusFilter) => void;
  setSortOption: (option: OrderSortOption) => void;
}

// Configure Fuse.js for fuzzy search
const fuseOptions = {
  keys: [
    { name: 'orderNumber', weight: 2 },
    { name: 'productName', weight: 1.5 },
    { name: 'price', weight: 1 },
    { name: 'note', weight: 1 },
  ],
  threshold: 0.4, // 0.0 = exact match, 1.0 = match anything
  ignoreLocation: true,
  useExtendedSearch: false,
};

const searchOrders = (orders: Order[], query: string): Order[] => {
  if (!query.trim()) {
    return orders;
  }

  const fuse = new Fuse(orders, fuseOptions);
  const results = fuse.search(query);
  return results.map((result) => result.item);
};

const getComparableDate = (order: Order): number => {
  const parsedOrderDate = new Date(order.orderDate);
  return Number.isNaN(parsedOrderDate.getTime()) ? 0 : parsedOrderDate.getTime();
};

const sortOrders = (orders: Order[], option: OrderSortOption): Order[] => {
  const sorted = [...orders];

  if (option === 'date-desc') {
    sorted.sort((a, b) => getComparableDate(b) - getComparableDate(a));
  } else if (option === 'date-asc') {
    sorted.sort((a, b) => getComparableDate(a) - getComparableDate(b));
  }

  return sorted;
};

const filterOrdersByStatus = (orders: Order[], statusFilter: StatusFilter): Order[] => {
  if (statusFilter === 'all') {
    return orders;
  }

  return orders.filter((order) => order.status === statusFilter);
};

const getFilteredOrders = (
  orders: Order[],
  searchQuery: string,
  statusFilter: StatusFilter,
  sortOption: OrderSortOption,
): Order[] => {
  const searchedOrders = searchOrders(orders, searchQuery);
  const statusFiltered = filterOrdersByStatus(searchedOrders, statusFilter);
  return sortOrders(statusFiltered, sortOption);
};

export const useOrderStore = create<OrderStore>((set, get) => ({
  orders: [],
  filteredOrders: [],
  searchQuery: '',
  statusFilter: 'all',
  sortOption: 'date-desc',
  isLoading: false,
  error: null,

  setCurrentUserId: (userId) => {
    // Set the current userId on the repository (for LocalStorage repositories)
    if ('setCurrentUserId' in orderRepository) {
      (orderRepository as { setCurrentUserId: (id: string | null) => void }).setCurrentUserId(userId ?? null);
    }
  },

  fetchOrders: async () => {
    set({ isLoading: true, error: null });

    try {
      const orders = await orderRepository.getAll();

      const { searchQuery, statusFilter, sortOption } = get();
      const filteredOrders = getFilteredOrders(orders, searchQuery, statusFilter, sortOption);

      set({ orders, filteredOrders, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch orders',
        isLoading: false,
      });
    }
  },

  updateOrderStatus: async (id: string, status: OrderStatus) => {
    try {
      await orderRepository.update(id, { status });

      // Update local state
      set((state) => {
        const orders = state.orders.map((order) =>
          order.id === id ? { ...order, status } : order,
        );
        const filteredOrders = getFilteredOrders(
          orders,
          state.searchQuery,
          state.statusFilter,
          state.sortOption,
        );
        return { orders, filteredOrders };
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update order',
      });
    }
  },

  deleteOrders: async (ids: string[]) => {
    if (ids.length === 0) {
      return;
    }

    try {
      await Promise.all(ids.map((id) => orderRepository.delete(id)));

      set((state) => {
        const orders = state.orders.filter((order) => !ids.includes(order.id));
        const filteredOrders = getFilteredOrders(
          orders,
          state.searchQuery,
          state.statusFilter,
          state.sortOption,
        );
        return { orders, filteredOrders };
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete orders',
      });
    }
  },

  deleteOrder: async (id: string) => {
    await get().deleteOrders([id]);
  },

  exportOrders: () => {
    const { filteredOrders } = get();

    // Convert to CSV using papaparse (export filtered orders)
    const csv = Papa.unparse(
      filteredOrders.map((order) => ({
        'Order Number': order.orderNumber,
        'Product Name': order.productName,
        'Order Date': order.orderDate,
        Price: order.price,
        Status: order.status,
        Note: order.note ?? '',
      })),
    );

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `amazon-orders-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  },

  setSearchQuery: (query: string) => {
    set((state) => {
      const filteredOrders = getFilteredOrders(
        state.orders,
        query,
        state.statusFilter,
        state.sortOption,
      );
      return { searchQuery: query, filteredOrders };
    });
  },

  setStatusFilter: (status) => {
    set((state) => {
      const filteredOrders = getFilteredOrders(
        state.orders,
        state.searchQuery,
        status,
        state.sortOption,
      );
      return { statusFilter: status, filteredOrders };
    });
  },

  setSortOption: (option) => {
    set((state) => {
      const filteredOrders = getFilteredOrders(
        state.orders,
        state.searchQuery,
        state.statusFilter,
        option,
      );
      return { sortOption: option, filteredOrders };
    });
  },
}));

export type { StatusFilter, OrderSortOption };

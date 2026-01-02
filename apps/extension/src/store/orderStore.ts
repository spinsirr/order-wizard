import { create } from 'zustand';
import type { Order, OrderStatus } from '@/types';
import { orderRepository } from '@/config';
import Papa from 'papaparse';
import Fuse from 'fuse.js';

type StatusFilter = OrderStatus | 'all';
type OrderSortOption = 'date-desc' | 'date-asc';

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

// Filter and sort utilities
const fuseOptions = {
  keys: [
    { name: 'orderNumber', weight: 2 },
    { name: 'productName', weight: 1.5 },
    { name: 'price', weight: 1 },
    { name: 'note', weight: 1 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  useExtendedSearch: false,
};

const searchOrders = (orders: Order[], query: string): Order[] => {
  if (!query.trim()) {
    return orders;
  }
  const fuse = new Fuse(orders, fuseOptions);
  return fuse.search(query).map((result) => result.item);
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

export function filterAndSortOrders(
  orders: Order[],
  searchQuery: string,
  statusFilter: StatusFilter,
  sortOption: OrderSortOption,
): Order[] {
  const searchedOrders = searchOrders(orders, searchQuery);
  const statusFiltered = filterOrdersByStatus(searchedOrders, statusFilter);
  return sortOrders(statusFiltered, sortOption);
}

export function exportOrdersToCSV(orders: Order[]): void {
  const csv = Papa.unparse(
    orders.map((order) => ({
      'Order Number': order.orderNumber,
      'Product Name': order.productName,
      'Order Date': order.orderDate,
      Price: order.price,
      Status: order.status,
      Note: order.note ?? '',
    })),
  );

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `amazon-orders-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export type { StatusFilter, OrderSortOption };

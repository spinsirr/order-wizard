import Fuse from 'fuse.js';
import type { Order, OrderStatus } from '@/types';

export type StatusFilter = OrderStatus | 'all';
export type OrderSortOption = 'updated-desc' | 'updated-asc' | 'date-desc' | 'date-asc';

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

export function searchOrders(orders: Order[], query: string): Order[] {
  if (!query.trim()) {
    return orders;
  }
  const fuse = new Fuse(orders, fuseOptions);
  return fuse.search(query).map((result) => result.item);
}

function getUpdatedTime(order: Order): number {
  if (order.updatedAt) {
    const parsed = new Date(order.updatedAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }
  // Fallback to createdAt or 0
  if (order.createdAt) {
    const parsed = new Date(order.createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }
  return 0;
}

function getOrderDate(order: Order): number {
  const parsed = new Date(order.orderDate);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export function sortOrders(orders: Order[], option: OrderSortOption): Order[] {
  const sorted = [...orders];

  switch (option) {
    case 'updated-desc':
      sorted.sort((a, b) => getUpdatedTime(b) - getUpdatedTime(a));
      break;
    case 'updated-asc':
      sorted.sort((a, b) => getUpdatedTime(a) - getUpdatedTime(b));
      break;
    case 'date-desc':
      sorted.sort((a, b) => getOrderDate(b) - getOrderDate(a));
      break;
    case 'date-asc':
      sorted.sort((a, b) => getOrderDate(a) - getOrderDate(b));
      break;
  }

  return sorted;
}

export function filterOrdersByStatus(orders: Order[], statusFilter: StatusFilter): Order[] {
  if (statusFilter === 'all') {
    return orders;
  }
  return orders.filter((order) => order.status === statusFilter);
}

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

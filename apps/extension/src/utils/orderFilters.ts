import { matchSorter } from 'match-sorter';
import type { Order, OrderStatus } from '@/types';

export type StatusFilter = OrderStatus | 'all';
export type OrderSortOption = 'created-desc' | 'created-asc' | 'date-desc' | 'date-asc';

export function searchOrders(orders: Order[], query: string): Order[] {
  if (!query.trim()) {
    return orders;
  }

  return matchSorter(orders, query, {
    keys: ['orderNumber', 'productName', 'price', 'note'],
  });
}

function getCreatedTime(order: Order): number {
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
    case 'created-desc':
      sorted.sort((a, b) => getCreatedTime(b) - getCreatedTime(a));
      break;
    case 'created-asc':
      sorted.sort((a, b) => getCreatedTime(a) - getCreatedTime(b));
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

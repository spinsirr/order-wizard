import Fuse from 'fuse.js';
import type { Order, OrderStatus } from '@/types';

export type StatusFilter = OrderStatus | 'all';
export type OrderSortOption = 'date-desc' | 'date-asc';

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

function getComparableDate(order: Order): number {
  const parsedOrderDate = new Date(order.orderDate);
  return Number.isNaN(parsedOrderDate.getTime()) ? 0 : parsedOrderDate.getTime();
}

export function sortOrders(orders: Order[], option: OrderSortOption): Order[] {
  const sorted = [...orders];
  if (option === 'date-desc') {
    sorted.sort((a, b) => getComparableDate(b) - getComparableDate(a));
  } else if (option === 'date-asc') {
    sorted.sort((a, b) => getComparableDate(a) - getComparableDate(b));
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

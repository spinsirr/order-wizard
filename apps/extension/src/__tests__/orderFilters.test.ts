import { describe, it, expect } from 'vitest';
import {
  searchOrders,
  sortOrders,
  filterOrdersByStatus,
  filterAndSortOrders,
} from '../utils/orderFilters';
import type { Order } from '../types';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'test-id',
    userId: 'user-1',
    orderNumber: '111-0000000-0000000',
    productName: 'Test Product',
    orderDate: 'January 1, 2025',
    productImage: 'https://example.com/img.jpg',
    price: '$29.99',
    status: 'uncommented',
    ...overrides,
  };
}

describe('filterOrdersByStatus', () => {
  const orders = [
    makeOrder({ id: '1', status: 'uncommented' }),
    makeOrder({ id: '2', status: 'commented' }),
    makeOrder({ id: '3', status: 'reimbursed' }),
    makeOrder({ id: '4', status: 'comment_revealed' }),
  ];

  it('returns all orders when filter is "all"', () => {
    expect(filterOrdersByStatus(orders, 'all')).toHaveLength(4);
  });

  it('filters by uncommented', () => {
    const result = filterOrdersByStatus(orders, 'uncommented');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by commented', () => {
    const result = filterOrdersByStatus(orders, 'commented');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('filters by reimbursed', () => {
    const result = filterOrdersByStatus(orders, 'reimbursed');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('returns empty array when no match', () => {
    const result = filterOrdersByStatus(
      [makeOrder({ status: 'uncommented' })],
      'reimbursed',
    );
    expect(result).toHaveLength(0);
  });
});

describe('sortOrders', () => {
  const orders = [
    makeOrder({
      id: '1',
      createdAt: '2025-01-15T00:00:00Z',
      orderDate: 'March 10, 2025',
    }),
    makeOrder({
      id: '2',
      createdAt: '2025-03-01T00:00:00Z',
      orderDate: 'January 5, 2025',
    }),
    makeOrder({
      id: '3',
      createdAt: '2025-02-10T00:00:00Z',
      orderDate: 'February 20, 2025',
    }),
  ];

  it('sorts by created-desc (newest first)', () => {
    const result = sortOrders(orders, 'created-desc');
    expect(result.map((o) => o.id)).toEqual(['2', '3', '1']);
  });

  it('sorts by created-asc (oldest first)', () => {
    const result = sortOrders(orders, 'created-asc');
    expect(result.map((o) => o.id)).toEqual(['1', '3', '2']);
  });

  it('sorts by date-desc (newest order date first)', () => {
    const result = sortOrders(orders, 'date-desc');
    expect(result.map((o) => o.id)).toEqual(['1', '3', '2']);
  });

  it('sorts by date-asc (oldest order date first)', () => {
    const result = sortOrders(orders, 'date-asc');
    expect(result.map((o) => o.id)).toEqual(['2', '3', '1']);
  });

  it('does not mutate the original array', () => {
    const original = [...orders];
    sortOrders(orders, 'created-desc');
    expect(orders.map((o) => o.id)).toEqual(original.map((o) => o.id));
  });

  it('handles missing createdAt gracefully (treated as epoch 0)', () => {
    const withMissing = [
      makeOrder({ id: 'a', createdAt: undefined }),
      makeOrder({ id: 'b', createdAt: '2025-06-01T00:00:00Z' }),
    ];
    const result = sortOrders(withMissing, 'created-desc');
    expect(result[0].id).toBe('b');
  });
});

describe('filterAndSortOrders', () => {
  const orders = [
    makeOrder({
      id: '1',
      productName: 'Wireless Mouse',
      status: 'uncommented',
      createdAt: '2025-01-01T00:00:00Z',
    }),
    makeOrder({
      id: '2',
      productName: 'Keyboard',
      status: 'commented',
      createdAt: '2025-02-01T00:00:00Z',
    }),
    makeOrder({
      id: '3',
      productName: 'USB Cable',
      status: 'uncommented',
      createdAt: '2025-03-01T00:00:00Z',
    }),
  ];

  it('applies search + status + sort together', () => {
    // Filter uncommented, no search, newest first
    const result = filterAndSortOrders(orders, '', 'uncommented', 'created-desc');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('3');
    expect(result[1].id).toBe('1');
  });

  it('returns empty when search matches nothing', () => {
    const result = filterAndSortOrders(orders, 'nonexistent', 'all', 'created-desc');
    expect(result).toHaveLength(0);
  });

  it('returns all when no filters applied', () => {
    const result = filterAndSortOrders(orders, '', 'all', 'created-desc');
    expect(result).toHaveLength(3);
  });
});

describe('searchOrders', () => {
  it('matches note content', () => {
    const orders = [
      makeOrder({ id: '1', note: 'Customer asked for fragile packaging' }),
      makeOrder({ id: '2', note: 'Ship with signature required' }),
    ];

    const result = searchOrders(orders, 'fragile');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });
});

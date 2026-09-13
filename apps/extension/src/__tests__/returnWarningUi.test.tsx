// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderTable } from '@/components/OrderTable';
import { type Order, OrderStatus } from '@/types';

const data = vi.hoisted(() => ({ orders: [] as Order[] }));
vi.mock('@/hooks/useOrders', () => ({
  useOrders: () => ({ data: data.orders, isLoading: false }),
  useUpdateOrderStatus: () => ({ mutate: vi.fn() }),
  useUpdateOrderNote: () => ({ mutate: vi.fn() }),
  useDeleteOrders: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 200,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 200 })),
    measureElement: vi.fn(),
  }),
}));

function order(id: string, orderDate: string, status: OrderStatus = OrderStatus.Commented): Order {
  return {
    id,
    userId: 'user',
    orderNumber: id,
    productName: id,
    orderDate,
    status,
    price: '$20',
    productImage: '',
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 31, 12));
  window.history.replaceState({}, '', '/');
  data.orders = [
    order('new-order', '2026-08-25'),
    order('warning-order', '2026-08-06'),
    order('overdue-order', '2026-08-01'),
    order('paid-order', '2026-08-01', OrderStatus.Reimbursed),
  ];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('return reminder queue', () => {
  it('keeps the summary visible through searches and opens all affected orders', () => {
    render(<OrderTable />);
    expect(screen.getByText('2 orders need a return check')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'new-order' } });
    expect(screen.queryByRole('heading', { name: 'warning-order' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review returns' }));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
    expect(screen.getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
      'overdue-order',
      'warning-order',
    ]);
    expect(screen.queryByRole('heading', { name: 'paid-order' })).toBeNull();
    const links = screen.getAllByRole('link', { name: 'Start return' });
    expect(links[0].getAttribute('href')).toBe(
      'https://www.amazon.com/spr/returns/cart?orderId=overdue-order',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show all orders' }));
    expect(screen.getAllByRole('heading')).toHaveLength(4);
  });

  it('removes reimbursed orders immediately and offers an exit from the cleared queue', () => {
    const { rerender } = render(<OrderTable />);
    fireEvent.click(screen.getByRole('button', { name: 'Review returns' }));
    data.orders = data.orders.map((item) => ({ ...item, status: OrderStatus.Reimbursed }));
    rerender(<OrderTable />);
    expect(screen.getByText('All return reminders cleared')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Start return' })).toBeNull();
    expect(screen.queryByText('No orders found')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all orders' }));
    expect(screen.getAllByRole('heading')).toHaveLength(4);
  });

  it('opens the filtered queue from a desktop notification', () => {
    window.history.replaceState({}, '', '/sidepanel.html?view=returns');
    render(<OrderTable />);
    expect(screen.getAllByRole('heading')).toHaveLength(2);
    expect(screen.getAllByRole('heading')[0].textContent).toBe('overdue-order');
    expect(screen.queryByRole('heading', { name: 'new-order' })).toBeNull();
  });

  it('refreshes the countdown across midnight while the panel stays open', () => {
    vi.setSystemTime(new Date(2026, 7, 30, 23, 59, 30));
    data.orders = [order('boundary-order', '2026-08-06')];
    render(<OrderTable />);
    expect(screen.queryByText('1 order needs a return check')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('1 order needs a return check')).toBeTruthy();
    expect(screen.getByText('5 days to 30-day mark · consider returning')).toBeTruthy();
  });
});

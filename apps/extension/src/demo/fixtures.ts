import { type Order, OrderStatus } from '@/types';

export function mockOrder(daysSinceOrder: number, overrides: Partial<Order> = {}): Order {
  const date = new Date();
  date.setDate(date.getDate() - daysSinceOrder);
  return {
    id: 'story-order-1',
    userId: 'storybook-user',
    orderNumber: '114-9283417-6253801',
    productName: 'Rechargeable under-cabinet lights, warm white · 2 pack',
    orderDate: date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    productImage: '',
    price: '$34.98',
    status: OrderStatus.Uncommented,
    note: 'Follow up with the seller',
    createdAt: date.toISOString(),
    ...overrides,
  };
}

export function mockOrderList(): Order[] {
  return [
    mockOrder(7),
    mockOrder(26, {
      id: 'story-order-2',
      orderNumber: '113-4172508-9102663',
      productName: 'Compact espresso scale with timer and silicone mat',
      price: '$27.50',
      status: OrderStatus.Commented,
    }),
    mockOrder(29, {
      id: 'story-order-3',
      orderNumber: '112-7003981-1146270',
      productName: 'Foldable bamboo laptop stand with six height positions',
      price: '$39.99',
      status: OrderStatus.CommentRevealed,
    }),
    mockOrder(32, {
      id: 'story-order-4',
      orderNumber: '111-5639824-7651992',
      productName: 'Travel cable organizer, water-resistant canvas',
      price: '$18.75',
      status: OrderStatus.Reimbursed,
    }),
  ];
}

import { describe, expect, it } from 'vitest';
import { type Order, OrderStatus } from '@/types';
import { getReturnWarning } from '@/utils/returnWarnings';

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    userId: 'user',
    orderNumber: '111-1234567-1234567',
    productName: 'Test product',
    price: '$20',
    productImage: '',
    orderDate: 'August 1, 2026',
    status: OrderStatus.Uncommented,
    ...overrides,
  };
}

describe('return reminder timing', () => {
  it.each([
    [24, null, null],
    [25, 'warning', 5],
    [27, 'warning', 3],
    [28, 'urgent', 2],
    [29, 'urgent', 1],
    [30, 'overdue', 0],
    [31, 'overdue', -1],
  ])('at %i days, uses stage %s with %s days remaining', (age, stage, remaining) => {
    const warning = getReturnWarning(order(), new Date(2026, 7, 1 + Number(age), 23, 59));
    if (stage === null) {
      expect(warning).toBeNull();
    } else {
      expect(warning).toMatchObject({ stage, daysRemaining: remaining, targetDate: '2026-08-31' });
    }
  });

  it.each(Object.values(OrderStatus))('handles reimbursement status %s', (status) => {
    const warning = getReturnWarning(order({ status }), new Date(2026, 7, 29));
    expect(warning !== null).toBe(status !== OrderStatus.Reimbursed);
  });

  it('excludes deleted orders and future orders', () => {
    expect(getReturnWarning(order({ deletedAt: '2026-08-20' }), new Date(2026, 8, 1))).toBeNull();
    expect(getReturnWarning(order(), new Date(2026, 6, 30))).toBeNull();
  });

  it('uses the order date even when captured or modified recently', () => {
    expect(
      getReturnWarning(
        order({ createdAt: '2026-08-29', updatedAt: '2026-08-29' }),
        new Date(2026, 7, 29),
      ),
    ).toMatchObject({ daysSinceOrder: 28 });
  });

  it.each([
    'August 1, 2026',
    'Aug 1, 2026',
    '1 August 2026',
    '2026-08-01',
    '2026-08-01T00:00:00.000Z',
  ])('treats %s as the same calendar day', (orderDate) => {
    expect(getReturnWarning(order({ orderDate }), new Date(2026, 7, 26, 0, 0))).toMatchObject({
      daysSinceOrder: 25,
      daysRemaining: 5,
    });
  });

  it.each([
    '',
    'invalid',
    '02/03/2026',
    'February 30, 2026',
    '2026-02-29',
    '2026-13-01',
    '2026-01-32',
    '2026-08-01Tinvalid',
    'Aug 0, 2026',
  ])('does not invent a reminder for invalid or ambiguous date %s', (orderDate) => {
    expect(getReturnWarning(order({ orderDate }), new Date(2026, 8, 1))).toBeNull();
  });

  it('handles leap days and year boundaries', () => {
    expect(
      getReturnWarning(order({ orderDate: '2024-02-29' }), new Date(2024, 2, 25)),
    ).toMatchObject({ daysSinceOrder: 25, targetDate: '2024-03-30' });
    expect(
      getReturnWarning(order({ orderDate: '2025-12-20' }), new Date(2026, 0, 19)),
    ).toMatchObject({ daysSinceOrder: 30, targetDate: '2026-01-19' });
  });

  it('counts calendar days across spring and autumn daylight-saving changes', () => {
    expect(
      getReturnWarning(order({ orderDate: '2026-02-15' }), new Date(2026, 2, 12, 0, 1)),
    ).toMatchObject({ daysSinceOrder: 25 });
    expect(
      getReturnWarning(order({ orderDate: '2026-10-10' }), new Date(2026, 10, 4, 23, 59)),
    ).toMatchObject({ daysSinceOrder: 25 });
  });
});

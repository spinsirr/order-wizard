import { describe, expect, it } from 'vitest';
import { type Order, OrderStatus } from '@/types';
import { getReturnWarning } from '@/utils/returnWarnings';
import reminderCases from '../../../../test-fixtures/return-warnings.json';

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
  it.each(reminderCases)('agrees with the agent inbox for $orderDate on $asOf', (fixture) => {
    const now = new Date(`${fixture.asOf}T23:59:00`);
    const warning = getReturnWarning(order({ orderDate: fixture.orderDate }), now);
    if (fixture.stage === null) {
      expect(warning).toBeNull();
    } else {
      expect(warning).toMatchObject({
        stage: fixture.stage,
        daysRemaining: fixture.daysRemaining,
        targetDate: fixture.targetDate,
      });
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
});

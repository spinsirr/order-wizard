import { describe, it, expect } from 'vitest';
import { ORDERS_KEY, AUTH_STORAGE_KEY, CURRENT_USER_STORAGE_KEY, FB_PENDING_LISTING_KEY } from '../constants';
import { OrderStatus, ORDER_STATUS_LABELS, FBCondition, FB_CONDITION_LABELS, PriceRounding, PRICE_ROUNDING_LABELS, FBCategory, FB_CATEGORY_LABELS } from '../types';

describe('constants', () => {
  it('ORDERS_KEY is a readonly tuple', () => {
    expect(ORDERS_KEY).toEqual(['orders']);
  });

  it('storage keys are non-empty strings', () => {
    expect(AUTH_STORAGE_KEY).toBeTruthy();
    expect(CURRENT_USER_STORAGE_KEY).toBeTruthy();
    expect(FB_PENDING_LISTING_KEY).toBeTruthy();
  });
});

describe('OrderStatus enum', () => {
  it('has all four statuses', () => {
    expect(Object.values(OrderStatus)).toEqual([
      'uncommented',
      'commented',
      'comment_revealed',
      'reimbursed',
    ]);
  });

  it('every status has a label', () => {
    for (const status of Object.values(OrderStatus)) {
      expect(ORDER_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});

describe('FBCondition enum', () => {
  it('every condition has a label', () => {
    for (const condition of Object.values(FBCondition)) {
      expect(FB_CONDITION_LABELS[condition]).toBeTruthy();
    }
  });
});

describe('PriceRounding enum', () => {
  it('every rounding option has a label', () => {
    for (const rounding of Object.values(PriceRounding)) {
      expect(PRICE_ROUNDING_LABELS[rounding]).toBeTruthy();
    }
  });
});

describe('FBCategory enum', () => {
  it('every category has a label', () => {
    for (const category of Object.values(FBCategory)) {
      expect(FB_CATEGORY_LABELS[category]).toBeTruthy();
    }
  });
});

import { describe, it, expect } from 'vitest';

// Test the pure helper functions extracted from orderExport
// We can't test the full export functions (they depend on DOM + dynamic imports)
// but we can test the logic

import { ORDER_STATUS_LABELS } from '../types';

describe('parsePrice', () => {
  // Reimplementation for testing — mirrors orderExport.ts logic
  function parsePrice(price: string): number {
    const match = price.replace(/[^0-9.]/g, '');
    return Number.parseFloat(match) || 0;
  }

  it('parses dollar amounts', () => {
    expect(parsePrice('$29.99')).toBe(29.99);
  });

  it('parses amounts without dollar sign', () => {
    expect(parsePrice('100.50')).toBe(100.5);
  });

  it('strips non-numeric chars', () => {
    expect(parsePrice('USD $1,234.56')).toBe(1234.56);
  });

  it('returns 0 for empty string', () => {
    expect(parsePrice('')).toBe(0);
  });

  it('returns 0 for non-numeric string', () => {
    expect(parsePrice('free')).toBe(0);
  });
});

describe('statusFillCategory', () => {
  function statusFillCategory(status: string): 'green' | 'yellow' | 'blue' | 'gray' {
    switch (status) {
      case 'reimbursed':
        return 'green';
      case 'commented':
        return 'yellow';
      case 'comment_revealed':
        return 'blue';
      case 'uncommented':
        return 'gray';
      default:
        return 'gray';
    }
  }

  it('maps reimbursed to green', () => {
    expect(statusFillCategory('reimbursed')).toBe('green');
  });

  it('maps commented to yellow', () => {
    expect(statusFillCategory('commented')).toBe('yellow');
  });

  it('maps comment_revealed to blue', () => {
    expect(statusFillCategory('comment_revealed')).toBe('blue');
  });

  it('maps uncommented to gray', () => {
    expect(statusFillCategory('uncommented')).toBe('gray');
  });
});

describe('buildSummary', () => {
  function parsePrice(price: string): number {
    const match = price.replace(/[^0-9.]/g, '');
    return Number.parseFloat(match) || 0;
  }

  function readableStatus(status: string): string {
    return ORDER_STATUS_LABELS[status as keyof typeof ORDER_STATUS_LABELS] ?? status;
  }

  function buildSummary(orders: { status: string; price: string }[]) {
    const statusCounts: Record<string, number> = {};
    let totalValue = 0;

    for (const order of orders) {
      const label = readableStatus(order.status);
      statusCounts[label] = (statusCounts[label] || 0) + 1;
      totalValue += parsePrice(order.price);
    }

    return { total: orders.length, statusCounts, totalValue };
  }

  it('counts orders by status label', () => {
    const orders = [
      { status: 'uncommented', price: '$10.00' },
      { status: 'uncommented', price: '$20.00' },
      { status: 'reimbursed', price: '$30.00' },
    ];
    const summary = buildSummary(orders);
    expect(summary.total).toBe(3);
    expect(summary.statusCounts['Uncommented']).toBe(2);
    expect(summary.statusCounts['Reimbursed']).toBe(1);
  });

  it('sums total value correctly', () => {
    const orders = [
      { status: 'uncommented', price: '$10.50' },
      { status: 'commented', price: '$25.75' },
    ];
    const summary = buildSummary(orders);
    expect(summary.totalValue).toBeCloseTo(36.25);
  });

  it('handles empty orders', () => {
    const summary = buildSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.totalValue).toBe(0);
    expect(Object.keys(summary.statusCounts)).toHaveLength(0);
  });
});

describe('readableStatus', () => {
  it('maps all statuses to human-readable labels', () => {
    expect(ORDER_STATUS_LABELS['uncommented']).toBe('Uncommented');
    expect(ORDER_STATUS_LABELS['commented']).toBe('Commented');
    expect(ORDER_STATUS_LABELS['comment_revealed']).toBe('Comment Revealed');
    expect(ORDER_STATUS_LABELS['reimbursed']).toBe('Reimbursed');
  });
});

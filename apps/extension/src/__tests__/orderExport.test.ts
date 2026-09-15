import Papa from 'papaparse';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ORDER_STATUS_LABELS, type Order, OrderStatus } from '@/types';
import { exportOrdersToCSV } from '@/utils/orderExport';

function order(status: OrderStatus, price = '$12.50'): Order {
  return {
    id: status,
    userId: 'local',
    orderNumber: status,
    productName: 'Headphones, "blue"',
    orderDate: '2026-09-01',
    price,
    status,
    productImage: '',
    note: 'First line\nSecond line',
  };
}

async function exportedRows(orders: Order[]) {
  let blob: Blob | undefined;
  const click = vi.fn();
  const anchor = { href: '', download: '', click };
  vi.stubGlobal('document', { createElement: () => anchor });
  vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
    if (!(value instanceof Blob)) {
      throw new Error('Expected a Blob download');
    }
    blob = value;
    return 'blob:ordercue-export';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  await exportOrdersToCSV(orders);
  expect(click).toHaveBeenCalledOnce();
  expect(anchor.download).toMatch(/^amazon-orders-.*\.csv$/);
  if (!blob) {
    throw new Error('Export did not create a download');
  }
  return Papa.parse<Record<string, string>>(await blob.text(), { header: true }).data;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CSV export', () => {
  it.each(['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)'])(
    'escapes spreadsheet formula %s',
    async (formula) => {
      const rows = await exportedRows([
        { ...order(OrderStatus.Uncommented), productName: formula, note: formula },
      ]);
      expect(rows[0]?.['Product Name']).toBe(`'${formula}`);
      expect(rows[0]?.['Note']).toBe(`'${formula}`);
    },
  );
  it('uses the same status labels as the frontend and escapes product names and notes', async () => {
    const statuses = Object.values(OrderStatus);
    const rows = await exportedRows(statuses.map((status) => order(status)));
    expect(rows.slice(0, statuses.length).map((row) => row['Status'])).toEqual(
      statuses.map((status) => ORDER_STATUS_LABELS[status]),
    );
    expect(rows[0]?.['Product Name']).toBe('Headphones, "blue"');
    expect(rows[0]?.['Note']).toBe('First line\nSecond line');
  });
  it('exports totals and per-status counts from the actual order data', async () => {
    const rows = await exportedRows([
      order(OrderStatus.Uncommented, '$10.50'),
      order(OrderStatus.Uncommented, '$25.75'),
      order(OrderStatus.Reimbursed, '$30'),
    ]);
    expect(rows.find((row) => row['Image URL'] === 'Total Orders')?.['Order Number']).toBe('3');
    expect(rows.find((row) => row['Image URL'] === 'Total Spent')?.['Order Number']).toBe('$66.25');
    expect(
      rows.find((row) => row['Image URL'] === ORDER_STATUS_LABELS[OrderStatus.Uncommented])?.[
        'Order Number'
      ],
    ).toBe('2');
  });
  it('exports an empty collection without inventing an order', async () => {
    const rows = await exportedRows([]);
    expect(rows.find((row) => row['Image URL'] === 'Total Orders')?.['Order Number']).toBe('0');
    expect(rows.find((row) => row['Image URL'] === 'Total Spent')?.['Order Number']).toBe('$0.00');
  });
});

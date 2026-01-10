import Papa from 'papaparse';
import type { Order } from '@/types';

export function exportOrdersToCSV(orders: Order[]): void {
  const csv = Papa.unparse(
    orders.map((order) => ({
      'Order Number': order.orderNumber,
      'Product Name': order.productName,
      'Order Date': order.orderDate,
      Price: order.price,
      Status: order.status,
      Note: order.note ?? '',
    })),
  );

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `amazon-orders-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

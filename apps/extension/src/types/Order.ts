import type { OrderStatus } from './OrderStatus';

export interface Order {
  id: string;
  userId: string;
  orderNumber: string;
  productName: string;
  orderDate: string;
  productImage: string;
  price: string;
  status: OrderStatus;
  note?: string;
}

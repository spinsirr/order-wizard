import { z } from 'zod';
import { OrderStatus } from '@/types';

export const OrderSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1, 'User ID is required'),
  orderNumber: z.string().min(1, 'Order number is required'),
  productName: z.string().min(1, 'Product name is required'),
  orderDate: z.string().min(1, 'Order date is required'),
  productImage: z.string().url('Invalid image URL'),
  price: z.string().min(1, 'Price is required'),
  status: z.enum(OrderStatus),
  note: z.string().optional(),
});

export const ScrapedOrderDataSchema = z.object({
  orderNumber: z.string().min(1, 'Order number is required'),
  productName: z.string().min(1, 'Product name is required'),
  orderDate: z.string().min(1, 'Order date is required'),
  productImage: z.string().url('Invalid image URL'),
  price: z.string().min(1, 'Price is required'),
});

export type ScrapedOrderData = z.infer<typeof ScrapedOrderDataSchema>;

import { z } from 'zod';
import { OrderStatus } from '@/types';

export const OrderSchema = z.object({
  id: z.string().min(1, 'Order ID is required'),
  userId: z.string().min(1, 'User ID is required'),
  orderNumber: z.string().min(1, 'Order number is required'),
  productName: z.string().min(1, 'Product name is required'),
  orderDate: z.string().min(1, 'Order date is required'),
  productImage: z.union([z.url('Invalid image URL'), z.literal('')]),
  price: z.string().min(1, 'Price is required'),
  status: z.enum(OrderStatus),
  note: z.string().optional(),
  createdAt: z.iso.datetime({ offset: true }).optional(),
  updatedAt: z.iso.datetime({ offset: true }).optional(),
  deletedAt: z.iso.datetime({ offset: true }).optional(),
});

export const ScrapedOrderDataSchema = OrderSchema.pick({
  orderNumber: true,
  productName: true,
  orderDate: true,
  productImage: true,
  price: true,
}).extend({ productImage: z.url('Invalid image URL') });

export type ScrapedOrderData = z.infer<typeof ScrapedOrderDataSchema>;

export const OrderUpdatesSchema = OrderSchema.pick({ status: true, note: true, deletedAt: true })
  .partial()
  .strict()
  .refine(
    (updates) => Object.values(updates).some((value) => value !== undefined),
    'An update is required',
  );
export type OrderUpdates = z.infer<typeof OrderUpdatesSchema>;

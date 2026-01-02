import { z } from "zod";
import { OrderStatus } from "@/types/OrderStatus";

/**
 * Zod schema for Order validation
 */
export const OrderSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1, "User ID is required"),
  orderNumber: z.string().min(1, "Order number is required"),
  productName: z.string().min(1, "Product name is required"),
  orderDate: z.string().min(1, "Order date is required"),
  productImage: z.string().url("Invalid image URL"),
  price: z.string().min(1, "Price is required"),
  status: z.enum(OrderStatus),
  note: z.string().optional(),
});

/**
 * Schema for scraped order data (before adding id, userId, etc.)
 */
export const ScrapedOrderDataSchema = z.object({
  orderNumber: z.string().min(1, "Order number is required"),
  productName: z.string().min(1, "Product name is required"),
  orderDate: z.string().min(1, "Order date is required"),
  productImage: z.string().url("Invalid image URL"),
  price: z.string().min(1, "Price is required"),
});

export type ScrapedOrderData = z.infer<typeof ScrapedOrderDataSchema>;

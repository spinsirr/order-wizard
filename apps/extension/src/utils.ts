import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { z } from 'zod';
import { OrderStatus } from './types';

// ============================================================================
// Class Name Utilities
// ============================================================================

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ============================================================================
// Error Handling
// ============================================================================

function handleError(event: ErrorEvent | PromiseRejectionEvent): void {
  const error = event instanceof ErrorEvent
    ? event.error
    : event.reason instanceof Error ? event.reason : new Error(String(event.reason));

  console.error('Unhandled error:', error.message, error.stack);
}

export function initializeErrorHandlers(): void {
  if (typeof window !== 'undefined') {
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleError);
  } else if (typeof self !== 'undefined') {
    self.addEventListener('error', handleError as EventListener);
    self.addEventListener('unhandledrejection', handleError as EventListener);
  }
}

// ============================================================================
// Validation Schemas
// ============================================================================

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

import type { z } from 'zod';
import type { OrderSchema } from '@/schemas/order';
// Order status constants and type
export const OrderStatus = {
  Uncommented: 'uncommented',
  Commented: 'commented',
  CommentRevealed: 'comment_revealed',
  Reimbursed: 'reimbursed',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.Uncommented]: 'Pending',
  [OrderStatus.Commented]: 'Commented',
  [OrderStatus.CommentRevealed]: 'Revealed',
  [OrderStatus.Reimbursed]: 'Reimbursed',
};

export type Order = z.infer<typeof OrderSchema>;

// User interface
export interface User {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  createdAt: Date;
}

// Authenticated user with tokens
export interface AuthUser {
  sub: string;
  email?: string;
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_at: number;
}

export * from './fbListing';

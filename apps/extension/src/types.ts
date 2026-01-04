// Order status constants and type
export const OrderStatus = {
  Uncommented: 'uncommented',
  Commented: 'commented',
  CommentRevealed: 'comment_revealed',
  Reimbursed: 'reimbursed',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.Uncommented]: 'Uncommented',
  [OrderStatus.Commented]: 'Commented',
  [OrderStatus.CommentRevealed]: 'Comment Revealed',
  [OrderStatus.Reimbursed]: 'Reimbursed',
};

// Order interface
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
  /** ISO timestamp of when order was last modified (for sync conflict resolution) */
  updatedAt?: string;
  /** ISO timestamp of when order was created */
  createdAt?: string;
  /** ISO timestamp of when order was soft-deleted locally (for sync) */
  deletedAt?: string;
}

// User interface
export interface User {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  createdAt: Date;
}

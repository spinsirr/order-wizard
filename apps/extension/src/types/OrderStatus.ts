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

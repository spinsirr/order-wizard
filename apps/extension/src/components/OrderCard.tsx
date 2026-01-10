import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  CheckCircle2,
  Circle,
  Eye,
  MessageCircle,
  ClipboardList,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { OrderStatus, ORDER_STATUS_LABELS, type Order } from '@/types';
import { cn } from '@/utils';
import { Card, CardTitle } from './ui/card';

const FALLBACK_COLORS = [
  'bg-indigo-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-sky-500',
  'bg-purple-500',
  'bg-cyan-500',
  'bg-fuchsia-500',
] as const;

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
};

const getFallbackColor = (key: string): (typeof FALLBACK_COLORS)[number] => {
  const hash = Math.abs(hashString(key));
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
};

const statusConfig: Record<
  OrderStatus,
  {
    Icon: LucideIcon;
    activeButtonClass: string;
    activeIconClass: string;
  }
> = {
  [OrderStatus.Uncommented]: {
    Icon: ClipboardList,
    activeButtonClass:
      'bg-indigo-500 text-white border-indigo-500 dark:bg-indigo-400 dark:text-black',
    activeIconClass: 'text-white dark:text-black',
  },
  [OrderStatus.Commented]: {
    Icon: MessageCircle,
    activeButtonClass: 'bg-accent text-accent-foreground border-accent',
    activeIconClass: 'text-accent-foreground',
  },
  [OrderStatus.CommentRevealed]: {
    Icon: Eye,
    activeButtonClass: 'bg-primary text-primary-foreground border-primary',
    activeIconClass: 'text-primary-foreground',
  },
  [OrderStatus.Reimbursed]: {
    Icon: BadgeCheck,
    activeButtonClass:
      'bg-emerald-500 text-white border-emerald-500 dark:bg-emerald-400 dark:text-black',
    activeIconClass: 'text-white dark:text-black',
  },
};

const STATUS_SEQUENCE = Object.values(OrderStatus);
const CARD_CONTENT_WIDTH = 'mx-auto w-full max-w-none';

interface OrderCardProps {
  order: Order;
  isSelected: boolean;
  hasImageError: boolean;
  onToggleSelect: (orderId: string) => void;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onDelete: (orderId: string) => void;
  onImageError: (orderId: string) => void;
}

export function OrderCard({
  order,
  isSelected,
  hasImageError,
  onToggleSelect,
  onStatusChange,
  onDelete,
  onImageError,
}: OrderCardProps) {
  return (
    <Card
      elevation={isSelected ? 'high' : 'medium'}
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden border border-border bg-card text-foreground shadow-sm transition-shadow duration-200',
        isSelected
          ? 'ring-2 ring-primary/40 shadow-lg'
          : 'hover:shadow-[0_10px_20px_rgba(15,23,42,0.12)]',
      )}
    >
      <div
        className={cn(
          CARD_CONTENT_WIDTH,
          'border-b border-border bg-muted/60 px-6 py-3',
        )}
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground/80">Order #</span>
            <span className="font-medium text-foreground">{order.orderNumber}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground/80">Total</span>
            <span className="font-medium text-foreground">{order.price}</span>
          </div>
          <button
            type="button"
            className="ml-auto flex items-center gap-2 text-[11px] font-medium normal-case text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-pressed={isSelected}
            onClick={() => onToggleSelect(order.id)}
          >
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full border transition',
                isSelected
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border bg-muted text-muted-foreground',
              )}
            >
              {isSelected ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
            Select
          </button>
        </div>
      </div>

      <div
        className={cn(
          CARD_CONTENT_WIDTH,
          'grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 px-6 py-4 md:gap-6',
        )}
      >
        <div className="flex justify-start">
          <div className="h-24 w-24 overflow-hidden rounded-2xl border border-border bg-muted sm:h-28 sm:w-28 md:h-32 md:w-32">
            {order.productImage && !hasImageError ? (
              <img
                src={order.productImage}
                alt={order.productName}
                className="h-full w-full object-cover"
                onError={() => onImageError(order.id)}
              />
            ) : (
              <div
                className={cn(
                  'flex h-full w-full items-center justify-center text-2xl font-semibold text-white',
                  getFallbackColor(
                    (order.productName || order.orderNumber || order.id || '').trim() ||
                      order.id,
                  ),
                )}
                aria-hidden="true"
              >
                {(
                  (order.productName?.trim() || order.orderNumber?.trim() || 'U')[0] ||
                  'U'
                ).toUpperCase()}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <CardTitle className="text-sm font-semibold leading-snug text-foreground hover:text-primary md:text-base">
            {order.productName.length > 80
              ? `${order.productName.slice(0, 77)}...`
              : order.productName}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <div className="flex items-center gap-1.5">
              {STATUS_SEQUENCE.map((statusOption) => {
                const { Icon, activeButtonClass, activeIconClass } =
                  statusConfig[statusOption];
                const isActive = statusOption === order.status;
                return (
                  <button
                    key={statusOption}
                    type="button"
                    aria-pressed={isActive}
                    title={ORDER_STATUS_LABELS[statusOption]}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full border transition hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                      isActive
                        ? activeButtonClass
                        : 'border-border bg-muted text-muted-foreground hover:border-primary/40',
                    )}
                    onClick={() => {
                      if (!isActive) {
                        onStatusChange(order.id, statusOption);
                      }
                    }}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        isActive ? activeIconClass : 'text-muted-foreground',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
            <span className="text-[11px] text-muted-foreground/80">
              Placed {order.orderDate}
            </span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const sanitized = order.orderNumber.replace(/\s+/g, '');
                  const url = `https://www.amazon.com/gp/css/order-details?orderID=${encodeURIComponent(sanitized)}`;
                  window.open(url, '_blank', 'noopener');
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary transition hover:bg-primary/15"
                aria-label="Track order"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(order.id)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-destructive/30 text-destructive transition hover:bg-destructive/10"
                aria-label="Remove order"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

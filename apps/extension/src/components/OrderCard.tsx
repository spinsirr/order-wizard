import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  Check,
  ClipboardList,
  ExternalLink,
  Eye,
  MessageCircle,
  StickyNote,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { type KeyboardEvent, memo, useEffect, useState } from 'react';
import { CopyOrderNumber } from '@/components/CopyOrderNumber';
import { cn } from '@/lib';
import { ORDER_STATUS_LABELS, type Order, OrderStatus } from '@/types';
import { getReturnWarningLabel, type ReturnWarning } from '@/utils/returnWarnings';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select';

const FALLBACK_COLORS = [
  'bg-neutral-950',
  'bg-neutral-800',
  'bg-neutral-700',
  'bg-neutral-600',
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
    iconClass: string;
  }
> = {
  [OrderStatus.Uncommented]: {
    Icon: ClipboardList,
    iconClass: 'text-warning',
  },
  [OrderStatus.Commented]: {
    Icon: MessageCircle,
    iconClass: 'text-link',
  },
  [OrderStatus.CommentRevealed]: {
    Icon: Eye,
    iconClass: 'text-[#7928ca] dark:text-[#b989f5]',
  },
  [OrderStatus.Reimbursed]: {
    Icon: BadgeCheck,
    iconClass: 'text-[#0a7f3f] dark:text-[#50e3c2]',
  },
};

const STATUS_SEQUENCE = Object.values(OrderStatus);
const CARD_STATUS_LABELS = {
  ...ORDER_STATUS_LABELS,
  [OrderStatus.Uncommented]: 'Pending',
  [OrderStatus.CommentRevealed]: 'Revealed',
};

const getAmazonOrderUrl = (orderNumber: string) => {
  const sanitized = orderNumber.replace(/\s+/g, '');
  return `https://www.amazon.com/gp/css/order-details?orderID=${encodeURIComponent(sanitized)}`;
};

const getAmazonReturnUrl = (orderNumber: string) => {
  const sanitized = orderNumber.replace(/\s+/g, '');
  return `https://www.amazon.com/spr/returns/cart?orderId=${encodeURIComponent(sanitized)}`;
};

interface OrderCardProps {
  order: Order;
  returnWarning?: ReturnWarning;
  isSelected: boolean;
  hasImageError: boolean;
  onToggleSelect: (orderId: string) => void;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onNoteSave: (orderId: string, note: string) => void;
  onDelete: (orderId: string) => void;
  onImageError: (orderId: string) => void;
}

function OrderCardImpl({
  order,
  returnWarning,
  isSelected,
  hasImageError,
  onToggleSelect,
  onStatusChange,
  onNoteSave,
  onDelete,
  onImageError,
}: OrderCardProps) {
  const savedNote = order.note ?? '';
  const [draftNote, setDraftNote] = useState(savedNote);
  const isDirty = draftNote !== savedNote;
  const orderUrl = getAmazonOrderUrl(order.orderNumber);
  const { Icon: StatusIcon, iconClass } = statusConfig[order.status];

  useEffect(() => {
    if (!isDirty) setDraftNote(savedNote);
  }, [savedNote, isDirty]);

  const commitNote = () => {
    if (isDirty) onNoteSave(order.id, draftNote);
  };

  const handleNoteKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitNote();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraftNote(savedNote);
      event.currentTarget.blur();
    }
  };

  return (
    <Card
      className={cn(
        'relative w-full gap-0 overflow-hidden bg-card px-3 py-2.5 text-foreground shadow-none transition-[border-color,background-color,box-shadow,transform] duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-sm',
        isSelected
          ? 'border-link/55 ring-2 ring-link/12'
          : 'hover:border-foreground/20 hover:bg-secondary/25',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        aria-label={
          isSelected ? `Deselect order ${order.orderNumber}` : `Select order ${order.orderNumber}`
        }
        title={isSelected ? 'Deselect order' : 'Select order'}
        aria-pressed={isSelected}
        onClick={() => onToggleSelect(order.id)}
        className="absolute inset-0 z-10 h-auto w-auto rounded-[inherit] p-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-link/60 focus-visible:ring-inset active:scale-100"
      >
        <span className="sr-only">{isSelected ? 'Deselect' : 'Select'} this order</span>
      </Button>

      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5 font-mono text-micro font-medium uppercase tracking-[0.06em] text-muted-foreground">
          <span className="shrink-0">Order</span>
          <CopyOrderNumber orderNumber={order.orderNumber} />
          <span className="text-border" aria-hidden="true">
            ·
          </span>
          <span className="shrink-0 normal-case tracking-normal">{order.orderDate}</span>
        </div>
        <Checkbox
          checked={isSelected}
          tabIndex={-1}
          aria-hidden="true"
          onCheckedChange={() => onToggleSelect(order.id)}
          className="relative z-20 size-5 rounded-md"
        />
      </div>

      <div className="mt-2 flex min-w-0 gap-2.5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
          {order.productImage && !hasImageError ? (
            <img
              src={order.productImage}
              alt={order.productName}
              width={64}
              height={64}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain p-1.5"
              onError={() => onImageError(order.id)}
            />
          ) : (
            <div
              className={cn(
                'flex h-full w-full items-center justify-center text-heading font-semibold text-white',
                getFallbackColor(
                  (order.productName || order.orderNumber || order.id || '').trim() || order.id,
                ),
              )}
              aria-hidden="true"
            >
              {(
                (order.productName?.trim() || order.orderNumber?.trim() || 'O')[0] || 'O'
              ).toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          <h2 className="line-clamp-2 text-body font-semibold text-foreground">
            {order.productName}
          </h2>

          <div className="flex min-w-0 items-end justify-between gap-2">
            <span className="shrink-0 font-mono text-body font-medium leading-none text-foreground">
              {order.price}
            </span>

            <div className="relative z-20 flex shrink-0 items-center gap-0.5">
              <Select
                value={order.status}
                onValueChange={(value) => onStatusChange(order.id, value as OrderStatus)}
              >
                <SelectTrigger
                  size="sm"
                  aria-label={`Status for ${order.productName}`}
                  title={CARD_STATUS_LABELS[order.status]}
                  className="size-8 shrink-0 justify-center bg-card p-0 shadow-none [&_[data-slot=select-trigger-chevron]]:hidden"
                >
                  <StatusIcon className={cn('size-4', iconClass)} aria-hidden="true" />
                </SelectTrigger>
                <SelectContent position="popper" align="end" className="min-w-40">
                  {STATUS_SEQUENCE.map((statusOption) => {
                    const { Icon, iconClass: optionIconClass } = statusConfig[statusOption];

                    return (
                      <SelectItem key={statusOption} value={statusOption}>
                        <Icon className={cn('size-4', optionIconClass)} aria-hidden="true" />
                        {CARD_STATUS_LABELS[statusOption]}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <Button asChild variant="ghost" size="icon-sm" className="text-link">
                <a
                  href={orderUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open order on Amazon"
                  title="Open order on Amazon"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(order.id)}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remove order"
                title="Remove order"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {returnWarning && (
        <div className="mt-2.5 flex items-start gap-2 border-t border-border pt-2 text-caption">
          <TriangleAlert
            aria-hidden="true"
            className={cn(
              'mt-0.5 size-3.5 shrink-0',
              returnWarning.stage === 'warning' ? 'text-warning' : 'text-destructive',
            )}
          />
          <div className="min-w-0">
            <p
              className={cn('font-medium', returnWarning.stage === 'overdue' && 'text-destructive')}
            >
              {getReturnWarningLabel(returnWarning)}
            </p>
            <p className="mt-0.5 text-micro text-muted-foreground">
              Not reimbursed · estimated from order date.
            </p>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="relative z-20 mt-1.5 h-8 text-caption"
            >
              <a
                href={getAmazonReturnUrl(order.orderNumber)}
                target="_blank"
                rel="noreferrer"
                title="Open this order in Amazon's Returns Center"
              >
                Start return <ExternalLink aria-hidden="true" />
              </a>
            </Button>
            <p className="mt-1 text-micro text-muted-foreground">
              Choose items, reason, and return method on Amazon.
            </p>
          </div>
        </div>
      )}

      <div className="mt-2.5 flex min-w-0 items-center gap-1.5 border-t border-border pt-2">
        <div className="relative z-20 min-w-0 flex-1">
          <Label htmlFor={`order-note-${order.id}`} className="sr-only">
            Order note
          </Label>
          <StickyNote
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={`order-note-${order.id}`}
            type="text"
            value={draftNote}
            onChange={(event) => setDraftNote(event.target.value)}
            onKeyDown={handleNoteKeyDown}
            placeholder="Add a note…"
            autoComplete="off"
            title="Press Enter to save · Esc to discard"
            className={cn(
              'h-8 bg-card pl-8 pr-2.5 text-caption shadow-none placeholder:text-faint',
              isDirty && 'border-link focus-visible:border-link',
            )}
          />
        </div>

        {isDirty ? (
          <>
            <Button
              type="button"
              size="icon-sm"
              className="relative z-20 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-90"
              onClick={commitNote}
              aria-label="Save note"
              title="Save note"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setDraftNote(savedNote)}
              className="relative z-20 text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-90"
              aria-label="Discard note changes"
              title="Discard note changes"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  );
}

export const OrderCard = memo(OrderCardImpl);

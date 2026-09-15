import { BadgeCheck, ClipboardList, Eye, type LucideIcon, MessageCircle } from 'lucide-react';
import { cn } from '@/lib';
import { ORDER_STATUS_LABELS, OrderStatus } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select';

export interface StatusOption<T extends string = string> {
  id: T;
  label: string;
  Icon: LucideIcon;
  iconClass: string;
}

export const DEFAULT_STATUS_OPTIONS: StatusOption<OrderStatus>[] = [
  {
    id: OrderStatus.Uncommented,
    label: ORDER_STATUS_LABELS[OrderStatus.Uncommented],
    Icon: ClipboardList,
    iconClass: 'text-warning',
  },
  {
    id: OrderStatus.Commented,
    label: ORDER_STATUS_LABELS[OrderStatus.Commented],
    Icon: MessageCircle,
    iconClass: 'text-link',
  },
  {
    id: OrderStatus.CommentRevealed,
    label: ORDER_STATUS_LABELS[OrderStatus.CommentRevealed],
    Icon: Eye,
    iconClass: 'text-[#7928ca] dark:text-[#b989f5]',
  },
  {
    id: OrderStatus.Reimbursed,
    label: ORDER_STATUS_LABELS[OrderStatus.Reimbursed],
    Icon: BadgeCheck,
    iconClass: 'text-[#0a7f3f] dark:text-[#50e3c2]',
  },
];

export function OrderStatusSelect<T extends string>({
  value,
  options,
  productName,
  onChange,
}: {
  value: T;
  options: StatusOption<T>[];
  productName: string;
  onChange: (value: T) => void;
}) {
  const selected = options.find((option) => option.id === value);
  if (!selected) {
    throw new Error(`Missing status option: ${value}`);
  }
  const Icon = selected.Icon;
  return (
    <Select
      value={value}
      onValueChange={(id) => {
        const option = options.find((item) => item.id === id);
        if (option) {
          onChange(option.id);
        }
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Status for ${productName}`}
        title={selected.label}
        className="size-8 shrink-0 justify-center bg-card p-0 shadow-none [&_[data-slot=select-trigger-chevron]]:hidden"
      >
        <Icon className={cn('size-4', selected.iconClass)} aria-hidden="true" />
      </SelectTrigger>
      <SelectContent position="popper" align="end" className="min-w-40">
        {options.map(({ id, label, Icon: OptionIcon, iconClass }) => (
          <SelectItem key={id} value={id}>
            <OptionIcon className={cn('size-4', iconClass)} aria-hidden="true" />
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

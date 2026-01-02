import * as React from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'info' | 'destructive' | 'outline';

const variantStyles: Record<BadgeVariant, string> = {
  default:
    'bg-primary/15 text-primary ring-1 ring-inset ring-primary/20 dark:bg-primary/20 dark:text-primary-foreground',
  success:
    'bg-emerald-500/15 text-emerald-600 ring-1 ring-inset ring-emerald-500/30 dark:bg-emerald-500/25 dark:text-emerald-200',
  warning:
    'bg-amber-500/15 text-amber-600 ring-1 ring-inset ring-amber-500/30 dark:bg-amber-500/25 dark:text-amber-100',
  info: 'bg-sky-500/15 text-sky-600 ring-1 ring-inset ring-sky-500/25 dark:bg-sky-500/25 dark:text-sky-200',
  destructive:
    'bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/25 dark:bg-destructive/25 dark:text-destructive-foreground',
  outline:
    'bg-transparent text-foreground ring-1 ring-inset ring-border/80 dark:text-foreground dark:ring-border/40',
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide transition-colors duration-200',
        variantStyles[variant],
        className,
      )}
      {...props}
    />
  ),
);
Badge.displayName = 'Badge';

export { Badge, type BadgeVariant };

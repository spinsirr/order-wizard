import * as React from 'react';
import { cn } from '@/lib';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'tonal' | 'outline' | 'text' | 'icon' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'filled', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'relative inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium tracking-wide transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60',
          {
            'rounded-full px-6 py-2.5': size === 'default',
            'rounded-full px-4 py-2 text-xs': size === 'sm',
            'rounded-full px-7 py-3 text-base': size === 'lg',
            'h-11 w-11 rounded-full p-0': size === 'icon',
          },
          {
            'bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(103,80,164,0.3)] hover:bg-primary/90':
              variant === 'filled',
            'bg-secondary text-secondary-foreground hover:bg-secondary/80': variant === 'tonal',
            'border border-border text-primary bg-transparent hover:bg-primary/10':
              variant === 'outline',
            'bg-transparent text-primary hover:bg-primary/10': variant === 'text',
            'bg-destructive text-destructive-foreground hover:bg-destructive/90':
              variant === 'destructive',
            'bg-muted text-primary hover:bg-muted/80': variant === 'icon',
          },
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button };

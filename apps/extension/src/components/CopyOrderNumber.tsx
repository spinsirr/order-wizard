import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function CopyOrderNumber({ orderNumber }: { orderNumber: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => {
    if (status !== 'copied') {
      return;
    }
    const timeout = window.setTimeout(() => setStatus('idle'), 2000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const copyOrderNumber = async () => {
    setStatus('idle');
    try {
      await navigator.clipboard.writeText(orderNumber);
      setStatus('copied');
    } catch {
      setStatus('error');
    }
  };

  return (
    <span className="relative z-20 inline-flex min-w-0 flex-col items-start">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 min-w-0 gap-1.5 rounded px-1 py-0 font-mono text-micro font-medium tracking-normal text-muted-foreground"
        aria-label={`Copy order number ${orderNumber}`}
        title={status === 'copied' ? 'Copied!' : 'Copy order number'}
        onClick={(event) => {
          event.stopPropagation();
          void copyOrderNumber();
        }}
      >
        <span className="truncate">{orderNumber}</span>
        {status === 'copied' ? (
          <Check className="size-3 shrink-0" aria-hidden="true" />
        ) : (
          <Copy className="size-3 shrink-0" aria-hidden="true" />
        )}
      </Button>
      <output
        className={status === 'error' ? 'text-micro normal-case text-destructive' : 'sr-only'}
      >
        {status === 'copied' && 'Order number copied'}
        {status === 'error' && 'Copy failed. Try again.'}
      </output>
    </span>
  );
}

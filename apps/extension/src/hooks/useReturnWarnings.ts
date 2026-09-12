import { useEffect, useMemo, useState } from 'react';
import type { Order } from '@/types';
import { getReturnWarning, type ReturnWarning } from '@/utils/returnWarnings';

export function useReturnWarnings(orders: Order[]) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const refresh = () => setNow(new Date());
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return useMemo(() => {
    const warnings = new Map<string, ReturnWarning>();
    for (const order of orders) {
      const warning = getReturnWarning(order, now);
      if (warning) warnings.set(order.id, warning);
    }
    return warnings;
  }, [orders, now]);
}

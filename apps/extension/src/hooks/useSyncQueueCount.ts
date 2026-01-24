import { useEffect, useSyncExternalStore } from 'react';
import { syncQueue } from '@/lib/syncQueue';

export function useSyncQueueCount(): number {
  useEffect(() => {
    syncQueue.hydrate();
  }, []);

  return useSyncExternalStore(
    syncQueue.subscribe.bind(syncQueue),
    syncQueue.getSnapshot.bind(syncQueue),
    syncQueue.getServerSnapshot.bind(syncQueue)
  );
}

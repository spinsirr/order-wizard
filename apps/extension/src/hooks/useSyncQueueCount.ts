import { useQuery } from '@tanstack/react-query';
import { syncQueue } from '@/lib/syncQueue';

export const SYNC_QUEUE_QUERY_KEY = ['sync-queue'] as const;

export function useSyncQueueCount(userId?: string): number {
  const { data = 0 } = useQuery({
    queryKey: [...SYNC_QUEUE_QUERY_KEY, userId],
    queryFn: () => syncQueue.getPendingCount(userId),
  });
  return data;
}

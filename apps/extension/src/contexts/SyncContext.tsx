import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AUTH_STORAGE_KEY, ORDERS_KEY } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { SYNC_QUEUE_QUERY_KEY, useSyncQueueCount } from '@/hooks/useSyncQueueCount';
import { orderTime, StoredQueueSchema } from '@/lib/orderStorage';
import { syncQueue } from '@/lib/syncQueue';
import { apiRepository, localRepository } from '@/repositories';
import type { AuthUser } from '@/types';

interface SyncContextValue {
  isSyncing: boolean;
  error: Error | null;
  lastSyncedAt: Date | null;
  pendingCount: number;
  triggerSync: () => void;
}
const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, workspaceUserId } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.sub;
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const pendingCount = useSyncQueueCount(workspaceUserId);

  async function pullAndMerge(uid: string) {
    if (!apiRepository) {
      return;
    }
    const stored = await chrome.storage.local.get<{ auth_user?: AuthUser }>(AUTH_STORAGE_KEY);
    const session: AuthUser | undefined = stored[AUTH_STORAGE_KEY];
    if (session?.sub !== uid || session.expires_at <= Date.now()) {
      throw new Error('Sign in to resume sync');
    }
    await syncQueue.process(uid);
    const [localOrders, cloudOrders] = await Promise.all([
      localRepository.getAll(uid),
      apiRepository.withAccessToken(session.access_token).getAll(),
    ]);
    const cloudMap = new Map(cloudOrders.map((order) => [order.orderNumber, order]));
    for (const cloud of cloudOrders) {
      if (cloud.userId !== uid) {
        throw new Error('Cloud order belongs to a different account');
      }
    }
    // The broker compares against the current local version inside its transaction.
    await localRepository.saveBatch(cloudOrders);
    // Also recover local edits made while the panel was closed or before the outbox existed.
    await syncQueue.enqueue(
      localOrders.filter((local) => {
        const cloud = cloudMap.get(local.orderNumber);
        return !cloud || orderTime(local) > orderTime(cloud);
      }),
    );
    await syncQueue.process(uid);
    // Tombstones remain in both replicas; queue emptiness is not a deletion acknowledgement protocol.
  }

  const syncMutation = useMutation({
    mutationFn: (uid: string) => pullAndMerge(uid),
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15000),
    onSuccess: (_data, uid) => {
      if (uid === activeUser.current) {
        setLastSyncedAt(new Date());
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      void queryClient.invalidateQueries({ queryKey: SYNC_QUEUE_QUERY_KEY });
    },
  });
  const activeUser = useRef(userId);
  activeUser.current = userId;
  const syncedUser = useRef<string | null>(null);
  useEffect(() => {
    if (isAuthenticated && userId && apiRepository && syncedUser.current !== userId) {
      syncedUser.current = userId;
      syncMutation.mutate(userId);
    }
    if (!isAuthenticated) {
      syncedUser.current = null;
      setLastSyncedAt(null);
    }
  }, [isAuthenticated, userId, syncMutation.mutate]);

  useEffect(() => {
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') {
        return;
      }
      if (changes['orders']) {
        void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      }
      if (!changes['sync_queue']) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: SYNC_QUEUE_QUERY_KEY });
      if (!isAuthenticated || !userId || syncMutation.isPending) {
        return;
      }
      const queue = StoredQueueSchema.safeParse(changes['sync_queue'].newValue ?? []);
      // Let the normal sync path report corrupt storage instead of discarding it here.
      if (
        !queue.success ||
        queue.data.some(
          (item) => item.operation.type === 'upsert' && item.operation.order.userId === userId,
        )
      ) {
        syncMutation.mutate(userId);
      }
    };
    chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
  }, [isAuthenticated, userId, queryClient, syncMutation.isPending, syncMutation.mutate]);

  return (
    <SyncContext.Provider
      value={{
        isSyncing: syncMutation.isPending,
        error: syncMutation.error,
        lastSyncedAt,
        pendingCount,
        triggerSync: () => {
          if (isAuthenticated && userId && !syncMutation.isPending) {
            syncMutation.mutate(userId);
          }
        },
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  return (
    useContext(SyncContext) ?? {
      isSyncing: false,
      error: null,
      lastSyncedAt: null,
      pendingCount: 0,
      triggerSync: () => {},
    }
  );
}

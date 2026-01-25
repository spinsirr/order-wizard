import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { localRepository, apiRepository } from '@/config';
import { syncQueue } from '@/lib/syncQueue';
import { useSyncQueueCount } from '@/hooks/useSyncQueueCount';
import { ORDERS_KEY } from '@/constants';
import type { Order } from '@/types';

interface SyncContextValue {
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  pendingCount: number;
  triggerSync: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

/**
 * Pull and merge orders using Last Write Wins strategy.
 * - Match by orderNumber
 * - Compare updatedAt, keep newest version
 * - Soft-deleted orders sync to cloud, then physically delete locally
 */
async function pullAndMerge(userId: string, queryClient: ReturnType<typeof useQueryClient>) {
  if (!apiRepository) return;

  console.log('[Sync] Starting sync for user:', userId);

  const [localOrders, cloudOrders] = await Promise.all([
    localRepository.getAll(),
    apiRepository.getAll(),
  ]);

  console.log('[Sync] Local:', localOrders.length, 'Cloud:', cloudOrders.length);

  const localMap = new Map(localOrders.map((o) => [o.orderNumber, o]));
  const cloudMap = new Map(cloudOrders.map((o) => [o.orderNumber, o]));
  const allOrderNumbers = new Set([...localMap.keys(), ...cloudMap.keys()]);

  let localChanged = false;

  for (const orderNumber of allOrderNumbers) {
    const local = localMap.get(orderNumber);
    const cloud = cloudMap.get(orderNumber);

    if (local && cloud) {
      // Both exist → compare updatedAt, keep newest
      const localTime = local.updatedAt || local.createdAt || '';
      const cloudTime = cloud.updatedAt || cloud.createdAt || '';

      if (localTime > cloudTime) {
        // Local is newer → push to cloud
        syncQueue.add({ type: 'upsert', order: { ...local, userId } });
      } else if (cloudTime > localTime) {
        // Cloud is newer → update local
        await localRepository.save(cloud);
        localChanged = true;
      }
      // If equal, no action needed
    } else if (cloud && !local) {
      // Cloud only → download to local
      await localRepository.save(cloud);
      localChanged = true;
    } else if (local && !cloud) {
      // Local only → upload to cloud
      syncQueue.add({ type: 'upsert', order: { ...local, userId } });
    }
  }

  // Process pending uploads
  await syncQueue.process();

  // Cleanup: physically delete soft-deleted orders that have been synced
  const updatedLocalOrders = await localRepository.getAll();
  for (const order of updatedLocalOrders) {
    if (order.deletedAt) {
      await localRepository.delete(order.id);
      localChanged = true;
    }
  }

  if (localChanged) {
    queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
  }

  console.log('[Sync] Sync completed');
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.sub;
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const pendingCount = useSyncQueueCount();

  const syncMutation = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error('User ID not available');
      return pullAndMerge(userId, queryClient);
    },
    onSuccess: () => {
      setLastSyncedAt(new Date());
    },
  });

  // Pull cloud orders on login (one-time)
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated && apiRepository && userId && !hasSyncedRef.current) {
      hasSyncedRef.current = true;
      syncMutation.mutate();
    }
    if (!isAuthenticated) {
      hasSyncedRef.current = false;
      setLastSyncedAt(null);
    }
  }, [isAuthenticated, userId, syncMutation]);

  // Listen for ORDER_SAVED from content script to queue new orders
  useEffect(() => {
    if (!isAuthenticated || !apiRepository || !userId) return;

    const handleMessage = (message: { type?: string; order?: Order }) => {
      if (message.type === 'ORDER_SAVED' && message.order) {
        // Queue the new order for sync
        syncQueue.add({ type: 'upsert', order: { ...message.order, userId } });
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [isAuthenticated, userId]);

  const triggerSync = () => {
    if (isAuthenticated && userId && !syncMutation.isPending) {
      syncMutation.mutate();
    }
  };

  return (
    <SyncContext.Provider value={{ isSyncing: syncMutation.isPending, lastSyncedAt, pendingCount, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    return { isSyncing: false, lastSyncedAt: null, pendingCount: 0, triggerSync: () => {} };
  }
  return context;
}

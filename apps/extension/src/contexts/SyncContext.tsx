import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { localRepository, apiRepository } from '@/config';
import { syncQueue } from '@/lib/syncQueue';
import { useSyncQueueCount } from '@/hooks/useSyncQueueCount';
import { ORDERS_KEY } from '@/constants';
import type { Order } from '@/types';
import type { ExtensionMessage } from '@/types/messages';

interface SyncContextValue {
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  pendingCount: number;
  triggerSync: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.sub;
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const pendingCount = useSyncQueueCount();

  async function pullAndMerge(uid: string) {
    if (!apiRepository) return;

    const [localOrders, cloudOrders] = await Promise.all([
      localRepository.getAll(),
      apiRepository.getAll(),
    ]);

    const localMap = new Map(localOrders.map((o) => [o.orderNumber, o]));
    const cloudMap = new Map(cloudOrders.map((o) => [o.orderNumber, o]));
    const allOrderNumbers = new Set([...localMap.keys(), ...cloudMap.keys()]);

    const ordersToSaveLocally: Order[] = [];

    for (const orderNumber of allOrderNumbers) {
      const local = localMap.get(orderNumber);
      const cloud = cloudMap.get(orderNumber);

      if (local && cloud) {
        const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
        const cloudTime = new Date(cloud.updatedAt || cloud.createdAt || 0).getTime();

        if (localTime > cloudTime) {
          syncQueue.add({ type: 'upsert', order: { ...local, userId: uid } });
        } else if (cloudTime > localTime) {
          ordersToSaveLocally.push(cloud);
        }
      } else if (cloud && !local) {
        ordersToSaveLocally.push(cloud);
      } else if (local && !cloud) {
        syncQueue.add({ type: 'upsert', order: { ...local, userId: uid } });
      }
    }

    if (ordersToSaveLocally.length > 0) {
      await localRepository.saveBatch(ordersToSaveLocally);
    }

    await syncQueue.process();

    // Only cleanup soft-deleted orders after confirming the sync queue is fully drained.
    // If items remain (pending retries), their delete ops haven't been confirmed by the server yet.
    const pendingCount = await syncQueue.getPendingCount();
    if (pendingCount === 0) {
      const updatedLocalOrders = await localRepository.getAll();
      const toDelete = updatedLocalOrders.filter((o) => o.deletedAt).map((o) => o.id);
      if (toDelete.length > 0) {
        await localRepository.deleteBatch(toDelete);
      }
    }

    if (ordersToSaveLocally.length > 0) {
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    }
  }

  const syncMutation = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error('User ID not available');
      return pullAndMerge(userId);
    },
    onSuccess: () => {
      setLastSyncedAt(new Date());
    },
  });

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
  }, [isAuthenticated, userId, syncMutation.mutate]);

  // Unified ORDER_SAVED listener: invalidate cache + queue for sync
  useEffect(() => {
    const handleMessage = (
      message: ExtensionMessage,
      sender: chrome.runtime.MessageSender
    ) => {
      if (sender.id !== chrome.runtime.id) return;

      if (message.type === 'ORDER_SAVED') {
        queryClient.invalidateQueries({ queryKey: ORDERS_KEY });

        if (isAuthenticated && apiRepository && userId) {
          syncQueue.add({ type: 'upsert', order: { ...message.order, userId } });
        }
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [isAuthenticated, userId, queryClient]);

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

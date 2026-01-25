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
}

const SyncContext = createContext<SyncContextValue | null>(null);

/**
 * Pull cloud orders on login (one-time download)
 * Local changes are synced via the queue in useOrders mutations
 */
async function pullCloudOrders(userId: string, queryClient: ReturnType<typeof useQueryClient>) {
  if (!apiRepository) return;

  console.log('[Sync] Pulling cloud orders for user:', userId);

  const [localOrders, cloudOrders, deletedOrderNumbers] = await Promise.all([
    localRepository.getAll(),
    apiRepository.getAll(),
    localRepository.getDeletedOrderNumbers(),
  ]);

  console.log('[Sync] Local:', localOrders.length, 'Cloud:', cloudOrders.length);

  const localOrderMap = new Map(localOrders.map((o) => [o.orderNumber, o]));
  const cloudOrderMap = new Map(cloudOrders.map((o) => [o.orderNumber, o]));
  const deletedSet = new Set(deletedOrderNumbers);

  // Download orders that exist in cloud but not locally (and not deleted)
  const ordersToDownload: Order[] = [];
  for (const cloudOrder of cloudOrders) {
    if (!localOrderMap.has(cloudOrder.orderNumber) && !deletedSet.has(cloudOrder.orderNumber)) {
      ordersToDownload.push(cloudOrder);
    }
  }

  console.log('[Sync] Downloading:', ordersToDownload.length, 'orders from cloud');

  if (ordersToDownload.length > 0) {
    for (const order of ordersToDownload) {
      await localRepository.save(order);
    }
    queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
  }

  // Upload local orders that don't exist in cloud yet
  for (const localOrder of localOrders) {
    if (localOrder.deletedAt) continue;

    if (!cloudOrderMap.has(localOrder.orderNumber)) {
      // Queue for upload - server will set userId from JWT
      syncQueue.add({ type: 'create', order: { ...localOrder, userId } });
    }
  }

  // Queue deletions for soft-deleted orders
  for (const localOrder of localOrders) {
    if (localOrder.deletedAt) {
      const cloudOrder = cloudOrderMap.get(localOrder.orderNumber);
      if (cloudOrder) {
        syncQueue.add({ type: 'delete', orderId: cloudOrder.id });
      }
    }
  }

  // Queue deletions for hard-deleted orders (tracked by order number)
  for (const orderNumber of deletedOrderNumbers) {
    const cloudOrder = cloudOrderMap.get(orderNumber);
    if (cloudOrder) {
      syncQueue.add({ type: 'delete', orderId: cloudOrder.id });
    }
  }

  // Process the queue
  await syncQueue.process();

  // Cleanup soft-deleted and tracked deletions
  await localRepository.clearDeletedOrderNumbers();
  for (const localOrder of localOrders) {
    if (localOrder.deletedAt) {
      await localRepository.delete(localOrder.id);
    }
  }

  console.log('[Sync] Pull completed');
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
      return pullCloudOrders(userId, queryClient);
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
        syncQueue.add({ type: 'create', order: { ...message.order, userId } });
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [isAuthenticated, userId]);

  return (
    <SyncContext.Provider value={{ isSyncing: syncMutation.isPending, lastSyncedAt, pendingCount }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    return { isSyncing: false, lastSyncedAt: null, pendingCount: 0 };
  }
  return context;
}

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
 * Sync orders on login:
 * 1. First, delete from cloud (process pending deletions)
 * 2. Then, download remaining cloud orders
 * 3. Upload local orders that don't exist in cloud
 */
async function pullCloudOrders(userId: string, queryClient: ReturnType<typeof useQueryClient>) {
  if (!apiRepository) return;

  console.log('[Sync] Starting sync for user:', userId);

  // Step 1: Get local state and pending deletions
  const [localOrders, deletedOrderNumbers] = await Promise.all([
    localRepository.getAll(),
    localRepository.getDeletedOrderNumbers(),
  ]);

  console.log('[Sync] Local orders:', localOrders.length, 'Pending deletions:', deletedOrderNumbers.length);

  // Step 2: Get cloud orders to find IDs for deletion
  const cloudOrders = await apiRepository.getAll();
  console.log('[Sync] Cloud orders:', cloudOrders.length);

  const cloudOrderMap = new Map(cloudOrders.map((o) => [o.orderNumber, o]));

  // Step 3: Queue and process deletions FIRST (before downloading)
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

  // Process deletions now
  await syncQueue.process();
  console.log('[Sync] Deletions processed');

  // Cleanup local deletion tracking
  await localRepository.clearDeletedOrderNumbers();
  for (const localOrder of localOrders) {
    if (localOrder.deletedAt) {
      await localRepository.delete(localOrder.id);
    }
  }

  // Step 4: Re-fetch cloud orders (after deletions) and download new ones
  const updatedCloudOrders = await apiRepository.getAll();
  const localOrderMap = new Map(localOrders.filter(o => !o.deletedAt).map((o) => [o.orderNumber, o]));

  const ordersToDownload: Order[] = [];
  for (const cloudOrder of updatedCloudOrders) {
    if (!localOrderMap.has(cloudOrder.orderNumber)) {
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

  // Step 5: Upload local orders that don't exist in cloud
  const updatedCloudOrderMap = new Map(updatedCloudOrders.map((o) => [o.orderNumber, o]));
  for (const localOrder of localOrders) {
    if (localOrder.deletedAt) continue;

    if (!updatedCloudOrderMap.has(localOrder.orderNumber)) {
      syncQueue.add({ type: 'create', order: { ...localOrder, userId } });
    }
  }

  // Process uploads
  await syncQueue.process();

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

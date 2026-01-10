import { createContext, useContext, useCallback, useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { localRepository, apiRepository } from '@/config';
import { ORDERS_KEY } from '@/constants';
import type { Order } from '@/types';

const SYNC_DEBOUNCE_MS = 500;

interface SyncContextValue {
  sync: () => void;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
}

const SyncContext = createContext<SyncContextValue | null>(null);

// Flag to prevent sync loop when we're writing downloaded data
let isWritingFromSync = false;

async function performSync(userId: string, queryClient: ReturnType<typeof useQueryClient>) {
  if (!apiRepository) return;

  console.log('[Sync] Starting sync for user:', userId);

  localRepository.setCurrentUserId(null);
  const [allLocalOrders, cloudOrders, deletedOrderNumbers] = await Promise.all([
    localRepository.getAll(),
    apiRepository.getAll(),
    localRepository.getDeletedOrderNumbers(),
  ]);

  console.log('[Sync] Local:', allLocalOrders.length, 'Cloud:', cloudOrders.length);

  const cloudOrderMap = new Map(cloudOrders.map((o) => [o.orderNumber, o]));
  const localOrderMap = new Map(allLocalOrders.map((o) => [o.orderNumber, o]));

  const ordersToUpload: Order[] = [];
  const ordersToDownload: Order[] = [];
  const cloudIdsToDelete: string[] = [];

  for (const localOrder of allLocalOrders) {
    if (localOrder.deletedAt) continue;

    const cloudOrder = cloudOrderMap.get(localOrder.orderNumber);

    if (localOrder.userId === 'local') {
      if (!cloudOrder) ordersToUpload.push({ ...localOrder, userId });
    } else if (localOrder.userId === userId) {
      if (!cloudOrder) {
        ordersToUpload.push(localOrder);
      } else {
        const localTime = localOrder.updatedAt ? new Date(localOrder.updatedAt).getTime() : 0;
        const cloudTime = cloudOrder.updatedAt ? new Date(cloudOrder.updatedAt).getTime() : 0;
        if (localTime > cloudTime) ordersToUpload.push(localOrder);
      }
    }
  }

  const deletedSet = new Set(deletedOrderNumbers);
  for (const cloudOrder of cloudOrders) {
    if (!localOrderMap.has(cloudOrder.orderNumber) && !deletedSet.has(cloudOrder.orderNumber)) {
      ordersToDownload.push(cloudOrder);
    }
  }

  for (const orderNumber of deletedOrderNumbers) {
    const cloudOrder = cloudOrderMap.get(orderNumber);
    if (cloudOrder) cloudIdsToDelete.push(cloudOrder.id);
  }

  for (const localOrder of allLocalOrders) {
    if (localOrder.deletedAt && localOrder.userId === userId) {
      const cloudOrder = cloudOrderMap.get(localOrder.orderNumber);
      if (cloudOrder) cloudIdsToDelete.push(cloudOrder.id);
    }
  }

  console.log('[Sync] Upload:', ordersToUpload.length, 'Download:', ordersToDownload.length, 'Delete:', cloudIdsToDelete.length);

  // Upload and delete on cloud
  if (ordersToUpload.length > 0) await apiRepository.saveAll(ordersToUpload);
  if (cloudIdsToDelete.length > 0) await apiRepository.deleteAll(cloudIdsToDelete);

  // Download to local - set flag to prevent sync loop
  if (ordersToDownload.length > 0) {
    isWritingFromSync = true;
    for (const order of ordersToDownload) {
      await localRepository.save(order);
    }
    isWritingFromSync = false;
    queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
  }

  // Cleanup
  await localRepository.clearDeletedOrderNumbers();

  for (const localOrder of allLocalOrders) {
    if (localOrder.deletedAt && localOrder.userId === userId) {
      isWritingFromSync = true;
      await localRepository.delete(localOrder.id);
      isWritingFromSync = false;
    }
  }

  console.log('[Sync] Completed');
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.sub;
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncMutation = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error('User ID not available');
      return performSync(userId, queryClient);
    },
    onSuccess: () => {
      setLastSyncedAt(new Date());
    },
  });

  const sync = useCallback(() => {
    if (!isAuthenticated || !apiRepository || !userId || syncMutation.isPending) return;

    // Debounce to prevent rapid successive syncs
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      syncMutation.mutate();
    }, SYNC_DEBOUNCE_MS);
  }, [isAuthenticated, userId, syncMutation]);

  // Auto-sync on login
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

  // Listen for storage changes - auto sync
  useEffect(() => {
    if (!isAuthenticated || !apiRepository || !userId) return;

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (isWritingFromSync) return; // Prevent loop

      // Check if orders changed
      const hasOrderChanges = Object.keys(changes).some((key) => key.startsWith('orders_'));
      if (hasOrderChanges) {
        console.log('[Sync] Storage changed, triggering sync');
        sync();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [isAuthenticated, userId, sync]);

  // Listen for ORDER_SAVED from content script
  useEffect(() => {
    if (!isAuthenticated || !apiRepository || !userId) return;

    const handleMessage = (message: { type?: string }) => {
      if (message.type === 'ORDER_SAVED') {
        sync();
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [isAuthenticated, userId, sync]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <SyncContext.Provider value={{ sync, isSyncing: syncMutation.isPending, lastSyncedAt }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    return { sync: () => {}, isSyncing: false, lastSyncedAt: null };
  }
  return context;
}

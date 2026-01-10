import { useEffect, useRef, useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { localRepository, apiRepository } from '@/config';
import { ORDERS_KEY } from '@/constants';
import type { Order } from '@/types';

/**
 * Cloud Sync Logic
 *
 * - Syncs on login + after any order change
 * - Uploads local orders to cloud
 * - Downloads cloud orders not in local
 * - Handles deletions both ways
 * - Conflicts: local wins (most recent updatedAt)
 */

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

  // Upload local orders to cloud
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
        if (localTime >= cloudTime) ordersToUpload.push(localOrder);
      }
    }
  }

  // Download cloud orders not in local
  const deletedSet = new Set(deletedOrderNumbers);
  for (const cloudOrder of cloudOrders) {
    if (!localOrderMap.has(cloudOrder.orderNumber) && !deletedSet.has(cloudOrder.orderNumber)) {
      ordersToDownload.push(cloudOrder);
    }
  }

  // Handle deletions
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

  // Execute batch operations
  if (ordersToUpload.length > 0) await apiRepository.saveAll(ordersToUpload);
  if (cloudIdsToDelete.length > 0) await apiRepository.deleteAll(cloudIdsToDelete);

  for (const order of ordersToDownload) {
    await localRepository.save(order);
  }

  await localRepository.clearDeletedOrderNumbers();

  for (const localOrder of allLocalOrders) {
    if (localOrder.deletedAt && localOrder.userId === userId) {
      await localRepository.delete(localOrder.id);
    }
  }

  // Invalidate all order queries (any userId)
  if (ordersToDownload.length > 0) {
    queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
  }

  console.log('[Sync] Completed');
}

/**
 * Sync local orders with cloud (on login + after order changes)
 */
export function useCloudSync() {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.sub;
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

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
    if (isAuthenticated && apiRepository && userId && !syncMutation.isPending) {
      syncMutation.mutate();
    }
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

  // Listen for order changes - trigger sync
  useEffect(() => {
    if (!isAuthenticated || !apiRepository || !userId) return;

    const syncTriggers = ['ORDER_SAVED', 'ORDER_UPDATED', 'ORDER_DELETED'];

    const handleMessage = (message: { type?: string }) => {
      if (message.type && syncTriggers.includes(message.type)) {
        sync();
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [isAuthenticated, userId, sync]);

  return {
    isSyncing: syncMutation.isPending,
    lastSyncedAt,
    error: syncMutation.error,
    sync,
  };
}

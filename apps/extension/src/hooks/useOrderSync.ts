import { useEffect, useRef } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAccessToken } from '@/hooks/useAccessToken';
import { localRepository, apiRepository } from '@/config';
import type { Order } from '@/types';

const ORDERS_KEY = ['orders'] as const;
const LOCAL_USER_ID = 'local';

/**
 * Local-First Sync Strategy:
 *
 * 1. Local storage is the source of truth for the UI
 * 2. Sync uploads local changes to cloud (one-way push)
 * 3. On first sync after login, merge cloud data with local
 * 4. Conflicts: local wins (user's most recent action takes precedence)
 */
async function performSync(userId: string, queryClient: ReturnType<typeof useQueryClient>) {
  if (!apiRepository) return;

  console.log('[Sync] Starting sync for user:', userId);

  // Get all local orders and cloud orders
  localRepository.setCurrentUserId(null); // Get ALL orders (no filter)
  const [allLocalOrders, cloudOrders, deletedOrderNumbers] = await Promise.all([
    localRepository.getAll(),
    apiRepository.getAll(),
    localRepository.getDeletedOrderNumbers(),
  ]);

  console.log('[Sync] Local orders:', allLocalOrders.length, 'Cloud orders:', cloudOrders.length);

  // Create maps for quick lookup
  const cloudOrderMap = new Map(cloudOrders.map((o) => [o.orderNumber, o]));
  const localOrderMap = new Map(allLocalOrders.map((o) => [o.orderNumber, o]));

  // Track what we need to do
  const ordersToUpload: Order[] = [];
  const ordersToDownload: Order[] = [];
  const cloudIdsToDelete: string[] = [];

  // Step 1: Process local orders that need to go to cloud
  for (const localOrder of allLocalOrders) {
    // Skip soft-deleted orders - they'll be handled separately
    if (localOrder.deletedAt) continue;

    const cloudOrder = cloudOrderMap.get(localOrder.orderNumber);

    if (localOrder.userId === LOCAL_USER_ID) {
      // Anonymous order - needs to be uploaded with real userId
      if (!cloudOrder) {
        ordersToUpload.push({ ...localOrder, userId });
      }
      // If cloud already has it, we'll keep local as-is (userId will stay 'local' until next save)
    } else if (localOrder.userId === userId) {
      // User's order - upload if cloud doesn't have it or local is newer
      if (!cloudOrder) {
        ordersToUpload.push(localOrder);
      } else {
        // Compare timestamps - local wins ties
        const localTime = localOrder.updatedAt ? new Date(localOrder.updatedAt).getTime() : 0;
        const cloudTime = cloudOrder.updatedAt ? new Date(cloudOrder.updatedAt).getTime() : 0;
        if (localTime >= cloudTime) {
          ordersToUpload.push(localOrder);
        }
      }
    }
  }

  // Step 2: Download cloud orders that don't exist locally
  // BUT skip orders that were deleted locally (tracked in deletedOrderNumbers)
  const deletedSet = new Set(deletedOrderNumbers);
  for (const cloudOrder of cloudOrders) {
    if (!localOrderMap.has(cloudOrder.orderNumber) && !deletedSet.has(cloudOrder.orderNumber)) {
      ordersToDownload.push(cloudOrder);
    }
  }

  // Step 3: Handle deletions tracked while offline
  for (const orderNumber of deletedOrderNumbers) {
    const cloudOrder = cloudOrderMap.get(orderNumber);
    if (cloudOrder) {
      cloudIdsToDelete.push(cloudOrder.id);
    }
  }

  // Step 4: Handle soft-deleted orders (authenticated deletions)
  for (const localOrder of allLocalOrders) {
    if (localOrder.deletedAt && localOrder.userId === userId) {
      const cloudOrder = cloudOrderMap.get(localOrder.orderNumber);
      if (cloudOrder) {
        cloudIdsToDelete.push(cloudOrder.id);
      }
    }
  }

  console.log('[Sync] To upload:', ordersToUpload.length);
  console.log('[Sync] To download:', ordersToDownload.length);
  console.log('[Sync] To delete from cloud:', cloudIdsToDelete.length);

  // Execute uploads (don't modify local storage - it's already correct)
  for (const order of ordersToUpload) {
    try {
      await apiRepository.save(order);
    } catch (err) {
      console.warn('[Sync] Failed to upload order:', order.orderNumber, err);
    }
  }

  // Execute downloads (save to local)
  for (const order of ordersToDownload) {
    try {
      await localRepository.save(order);
    } catch (err) {
      console.warn('[Sync] Failed to save downloaded order:', order.orderNumber, err);
    }
  }

  // Execute cloud deletions
  for (const id of cloudIdsToDelete) {
    try {
      await apiRepository.delete(id);
    } catch (err) {
      console.warn('[Sync] Failed to delete from cloud:', id, err);
    }
  }

  // Clear deletion tracking
  await localRepository.clearDeletedOrderNumbers();

  // Clean up soft-deleted local orders (they've been synced to cloud deletion)
  for (const localOrder of allLocalOrders) {
    if (localOrder.deletedAt && localOrder.userId === userId) {
      await localRepository.delete(localOrder.id);
    }
  }

  // Refresh UI if we downloaded anything
  if (ordersToDownload.length > 0) {
    queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
  }

  console.log('[Sync] Completed successfully');
}

/**
 * Hook that handles syncing local orders with the cloud when authenticated.
 *
 * Conflict Resolution Strategy:
 * - Orders are matched by orderNumber (unique per Amazon order)
 * - When both local and cloud have the same order:
 *   - Compare updatedAt timestamps
 *   - Most recently updated version wins
 *   - If no updatedAt, cloud version wins (safer default)
 * - New orders (exist only in one place) are synced to the other
 */
export function useOrderSync() {
  const { isAuthenticated, user } = useAuth();
  const { accessToken } = useAccessToken();
  const queryClient = useQueryClient();

  const userId = user?.sub;

  const syncMutation = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error('User ID not available');
      return performSync(userId, queryClient);
    },
  });

  // Sync on login
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated && accessToken && apiRepository && userId && !hasSyncedRef.current) {
      hasSyncedRef.current = true;
      syncMutation.mutate();
    }
    if (!isAuthenticated) {
      hasSyncedRef.current = false;
    }
  }, [isAuthenticated, accessToken, userId, syncMutation]);

  return {
    isSyncing: syncMutation.isPending,
    lastSyncedAt: syncMutation.isSuccess ? new Date() : null,
    error: syncMutation.error,
    syncToCloud: () => syncMutation.mutate(),
    isAuthenticated,
  };
}

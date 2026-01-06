import { useEffect } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAccessToken } from '@/hooks/useAccessToken';
import { localRepository, apiRepository } from '@/config';
import type { Order } from '@/types';

const ORDERS_KEY = ['orders'] as const;

/**
 * Compares two orders and returns the newer one based on updatedAt.
 * If updatedAt is missing, falls back to the second order (cloud preference).
 */
function getNewerOrder(a: Order, b: Order): Order {
  const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
  const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;

  // If both have timestamps, return the newer one
  if (aTime && bTime) {
    return aTime > bTime ? a : b;
  }

  // If only one has a timestamp, prefer that one
  if (aTime && !bTime) return a;
  if (bTime && !aTime) return b;

  // If neither has timestamp, prefer b (cloud)
  return b;
}

const LOCAL_USER_ID = 'local';

async function performSync(userId: string, queryClient: ReturnType<typeof useQueryClient>) {
  if (!apiRepository) return;

  // Get ALL local orders (including userId: 'local') and cloud orders
  localRepository.setCurrentUserId(null); // Clear filter to get all orders
  const [localOrders, cloudOrders, deletedOrderNumbers] = await Promise.all([
    localRepository.getAll(),
    apiRepository.getAll(),
    localRepository.getDeletedOrderNumbers(),
  ]);

  // Create map for cloud orders by orderNumber
  const cloudOrderMap = new Map(cloudOrders.map((o) => [o.orderNumber, o]));

  const ordersToUploadToCloud: Order[] = [];
  const ordersToSaveLocally: Order[] = [];
  const localOrdersToDelete: string[] = [];
  const ordersToDeleteFromCloud: string[] = [];

  // Process local orders
  for (const localOrder of localOrders) {
    const cloudOrder = cloudOrderMap.get(localOrder.orderNumber);

    if (localOrder.userId === LOCAL_USER_ID) {
      // This is a local-only order that needs to be synced
      if (cloudOrder) {
        // Already exists in cloud - keep cloud version, delete local
        ordersToSaveLocally.push(cloudOrder);
        localOrdersToDelete.push(localOrder.id);
      } else {
        // Doesn't exist in cloud - upload with real userId
        ordersToUploadToCloud.push({ ...localOrder, userId });
        localOrdersToDelete.push(localOrder.id); // Delete old local copy with 'local' userId
      }
    } else if (localOrder.userId === userId) {
      // User's existing order - normal conflict resolution
      if (localOrder.deletedAt) {
        // Soft-deleted order (authenticated deletion)
        if (cloudOrder) {
          const deletedTime = new Date(localOrder.deletedAt).getTime();
          const cloudUpdatedTime = cloudOrder.updatedAt
            ? new Date(cloudOrder.updatedAt).getTime()
            : 0;

          if (cloudUpdatedTime > deletedTime) {
            // Cloud was updated AFTER local deletion - restore
            ordersToSaveLocally.push(cloudOrder);
          } else {
            // Local deletion is newer - delete from cloud
            ordersToDeleteFromCloud.push(cloudOrder.id);
            localOrdersToDelete.push(localOrder.id);
          }
        } else {
          // Deleted locally and doesn't exist in cloud - cleanup
          localOrdersToDelete.push(localOrder.id);
        }
      } else if (cloudOrder) {
        // Both exist, resolve conflict
        const winner = getNewerOrder(localOrder, cloudOrder);
        if (winner === localOrder && winner.updatedAt !== cloudOrder.updatedAt) {
          ordersToUploadToCloud.push(localOrder);
        } else if (winner === cloudOrder && winner.updatedAt !== localOrder.updatedAt) {
          ordersToSaveLocally.push(cloudOrder);
        }
      } else {
        // Only exists locally - upload
        ordersToUploadToCloud.push(localOrder);
      }
    }
    // Ignore orders from other users
  }

  // Download cloud-only orders (orders that don't exist locally at all)
  for (const cloudOrder of cloudOrders) {
    const existsLocally = localOrders.some((o) => o.orderNumber === cloudOrder.orderNumber);
    if (!existsLocally) {
      ordersToSaveLocally.push(cloudOrder);
    }
  }

  // Handle tracked deletions (orders that were hard-deleted while not authenticated)
  for (const orderNumber of deletedOrderNumbers) {
    const cloudOrder = cloudOrderMap.get(orderNumber);
    if (cloudOrder) {
      ordersToDeleteFromCloud.push(cloudOrder.id);
    }
  }

  // Execute sync operations

  // Upload orders to cloud and save locally with real userId
  for (const order of ordersToUploadToCloud) {
    await apiRepository.save(order);
    await localRepository.save(order);
  }

  // Save cloud orders locally
  for (const order of ordersToSaveLocally) {
    await localRepository.save(order);
  }

  // Delete from cloud
  for (const id of ordersToDeleteFromCloud) {
    await apiRepository.delete(id);
  }

  // Delete old local orders (local userId copies, soft-deleted synced, etc.)
  for (const id of localOrdersToDelete) {
    await localRepository.delete(id);
  }

  // Clear deletion tracking after successful sync
  await localRepository.clearDeletedOrderNumbers();

  // Invalidate the orders query to refresh UI
  queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
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
  useEffect(() => {
    if (isAuthenticated && accessToken && apiRepository && userId) {
      syncMutation.mutate();
    }
  }, [isAuthenticated, accessToken, userId]);

  return {
    isSyncing: syncMutation.isPending,
    lastSyncedAt: syncMutation.isSuccess ? new Date() : null,
    error: syncMutation.error,
    syncToCloud: () => syncMutation.mutate(),
    isAuthenticated,
  };
}

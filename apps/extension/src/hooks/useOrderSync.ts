import { useEffect, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'react-oidc-context';
import { localRepository, apiRepository } from '@/config';
import type { Order } from '@/types';

const ORDERS_KEY = ['orders'] as const;

interface SyncState {
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  error: Error | null;
}

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
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [syncState, setSyncState] = useState<SyncState>({
    isSyncing: false,
    lastSyncedAt: null,
    error: null,
  });

  const isAuthenticated = auth.isAuthenticated;
  const accessToken = auth.user?.access_token;
  const userId = auth.user?.profile?.sub;

  // Sync local orders to cloud
  // Note: Token is set by useAccessToken hook in UserBar
  const syncToCloud = useCallback(async () => {
    if (!apiRepository || !accessToken || !userId) return;

    setSyncState((prev) => ({ ...prev, isSyncing: true, error: null }));

    try {
      // Get local and cloud orders
      const [localOrders, cloudOrders] = await Promise.all([
        localRepository.getAll(),
        apiRepository.getAll().catch(() => [] as Order[]),
      ]);

      // Create maps for efficient lookup
      const localOrderMap = new Map(localOrders.map((o) => [o.orderNumber, o]));
      const cloudOrderMap = new Map(cloudOrders.map((o) => [o.orderNumber, o]));

      // Collect all unique order numbers
      const allOrderNumbers = new Set([...localOrderMap.keys(), ...cloudOrderMap.keys()]);

      const ordersToUploadToCloud: Order[] = [];
      const ordersToSaveLocally: Order[] = [];

      const ordersToDeleteFromCloud: string[] = [];
      const ordersToCleanupLocally: string[] = [];

      for (const orderNumber of allOrderNumbers) {
        const localOrder = localOrderMap.get(orderNumber);
        const cloudOrder = cloudOrderMap.get(orderNumber);

        if (localOrder && cloudOrder) {
          // Order exists in both - check for soft delete scenario
          if (localOrder.deletedAt) {
            const deletedTime = new Date(localOrder.deletedAt).getTime();
            const cloudUpdatedTime = cloudOrder.updatedAt
              ? new Date(cloudOrder.updatedAt).getTime()
              : 0;

            if (cloudUpdatedTime > deletedTime) {
              // Cloud was updated AFTER local deletion - user re-added it
              // Restore the order locally (remove deletedAt, use cloud version)
              ordersToSaveLocally.push(cloudOrder);
            } else {
              // Local deletion is newer - delete from cloud
              ordersToDeleteFromCloud.push(cloudOrder.id);
              ordersToCleanupLocally.push(localOrder.id);
            }
          } else {
            // No deletion - resolve normal conflict
            const winner = getNewerOrder(localOrder, cloudOrder);
            if (winner === localOrder && winner.updatedAt !== cloudOrder.updatedAt) {
              // Local is newer - upload to cloud
              ordersToUploadToCloud.push(localOrder);
            } else if (winner === cloudOrder && winner.updatedAt !== localOrder.updatedAt) {
              // Cloud is newer - save locally
              ordersToSaveLocally.push(cloudOrder);
            }
            // If same updatedAt, no action needed
          }
        } else if (localOrder && !cloudOrder) {
          if (localOrder.deletedAt) {
            // Was deleted locally and doesn't exist in cloud - clean up local
            ordersToCleanupLocally.push(localOrder.id);
          } else {
            // Only exists locally - upload to cloud
            ordersToUploadToCloud.push(localOrder);
          }
        } else if (cloudOrder && !localOrder) {
          // Only exists in cloud - save locally
          ordersToSaveLocally.push(cloudOrder);
        }
      }

      // Upload local-only or newer local orders to cloud
      // Assign the authenticated user's ID to local orders before uploading
      for (const order of ordersToUploadToCloud) {
        const orderWithUserId = { ...order, userId };
        await apiRepository.save(orderWithUserId);
        // Also update local storage with the correct userId
        await localRepository.save(orderWithUserId);
      }

      // Save cloud-only or newer cloud orders locally
      for (const order of ordersToSaveLocally) {
        await localRepository.save(order);
      }

      // Delete from cloud (syncing local deletions)
      for (const id of ordersToDeleteFromCloud) {
        await apiRepository.delete(id);
      }

      // Clean up soft-deleted orders from local storage after sync
      for (const id of ordersToCleanupLocally) {
        await localRepository.delete(id);
      }

      // Invalidate the orders query to refresh UI
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY });

      setSyncState({
        isSyncing: false,
        lastSyncedAt: new Date(),
        error: null,
      });
    } catch (err) {
      console.error('[Sync] Failed to sync orders:', err);
      setSyncState((prev) => ({
        ...prev,
        isSyncing: false,
        error: err instanceof Error ? err : new Error('Sync failed'),
      }));
    }
  }, [accessToken, userId, queryClient]);

  // Sync on login
  useEffect(() => {
    if (isAuthenticated && accessToken && apiRepository) {
      void syncToCloud();
    }
  }, [isAuthenticated, accessToken, syncToCloud]);

  return {
    ...syncState,
    syncToCloud,
    isAuthenticated,
  };
}

import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { localRepository, apiRepository } from '@/config';
import { ORDERS_KEY, LOCAL_USER_ID } from '@/constants';
import type { Order, OrderStatus } from '@/types';

/**
 * Local-First Order Management
 *
 * - All reads/writes go to localStorage
 * - Cloud sync happens on login + manual trigger
 * - Conflicts: local wins (most recent action takes precedence)
 */

// ============================================================================
// Helpers
// ============================================================================

function useCurrentUserId(): string {
  const { isAuthenticated, user } = useAuth();
  return isAuthenticated && user ? user.sub : LOCAL_USER_ID;
}

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

    if (localOrder.userId === LOCAL_USER_ID) {
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

  if (ordersToDownload.length > 0) {
    queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
  }

  console.log('[Sync] Completed');
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Read orders from localStorage
 */
export function useOrders() {
  const { isAuthenticated, user } = useAuth();

  return useQuery({
    queryKey: ORDERS_KEY,
    queryFn: async () => {
      localRepository.setCurrentUserId(isAuthenticated && user ? user.sub : LOCAL_USER_ID);
      const orders = await localRepository.getAll();
      return orders.filter((order) => !order.deletedAt);
    },
    staleTime: 1000 * 60,
  });
}

/**
 * Update order status
 */
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      localRepository.setCurrentUserId(userId);
      await localRepository.update(id, { status, updatedAt: new Date().toISOString() });
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ORDERS_KEY });
      const previousOrders = queryClient.getQueryData<Order[]>(ORDERS_KEY);
      queryClient.setQueryData<Order[]>(ORDERS_KEY, (old) =>
        old?.map((order) => (order.id === id ? { ...order, status } : order))
      );
      return { previousOrders };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousOrders) queryClient.setQueryData(ORDERS_KEY, context.previousOrders);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

/**
 * Delete orders
 */
export function useDeleteOrders() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const userId = useCurrentUserId();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      localRepository.setCurrentUserId(userId);

      if (isAuthenticated) {
        for (const id of ids) {
          await localRepository.update(id, { deletedAt: new Date().toISOString() });
        }
      } else {
        localRepository.setCurrentUserId(null);
        const orders = await localRepository.getAll();
        const ordersToDelete = orders.filter((o) => ids.includes(o.id));

        for (const order of ordersToDelete) {
          await localRepository.trackDeletedOrderNumber(order.orderNumber);
          await localRepository.delete(order.id);
        }
      }
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ORDERS_KEY });
      const previousOrders = queryClient.getQueryData<Order[]>(ORDERS_KEY);
      queryClient.setQueryData<Order[]>(ORDERS_KEY, (old) =>
        old?.filter((order) => !ids.includes(order.id))
      );
      return { previousOrders };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousOrders) queryClient.setQueryData(ORDERS_KEY, context.previousOrders);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

/**
 * Save a new order
 */
export function useSaveOrder() {
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();

  return useMutation({
    mutationFn: async (order: Order) => {
      localRepository.setCurrentUserId(userId);
      await localRepository.save(order);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

/**
 * Sync local orders with cloud (on login + manual trigger)
 */
export function useOrderSync() {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.sub;

  const syncMutation = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error('User ID not available');
      return performSync(userId, queryClient);
    },
  });

  // Auto-sync on login
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated && apiRepository && userId && !hasSyncedRef.current) {
      hasSyncedRef.current = true;
      syncMutation.mutate();
    }
    if (!isAuthenticated) {
      hasSyncedRef.current = false;
    }
  }, [isAuthenticated, userId, syncMutation]);

  return {
    isSyncing: syncMutation.isPending,
    lastSyncedAt: syncMutation.isSuccess ? new Date() : null,
    error: syncMutation.error,
    sync: () => syncMutation.mutate(),
  };
}

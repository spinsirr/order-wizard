import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { localRepository, apiRepository } from '@/config';
import { ORDERS_KEY, LOCAL_USER_ID } from '@/constants';
import type { Order, OrderStatus } from '@/types';

/**
 * Local-First Architecture:
 * - UI always reads from localStorage
 * - Writes go to localStorage first, then sync to cloud in background
 * - Sync mechanism handles cloud synchronization
 */

/**
 * Get the current userId for localStorage operations.
 * - Authenticated: user.sub
 * - Not authenticated: 'local'
 */
function useCurrentUserId(): string {
  const { isAuthenticated, user } = useAuth();
  return isAuthenticated && user ? user.sub : LOCAL_USER_ID;
}

/**
 * Hook to read orders from localStorage.
 * Always reads from local - sync handles cloud synchronization.
 */
export function useOrders() {
  const { isAuthenticated, user } = useAuth();

  return useQuery({
    queryKey: ORDERS_KEY,
    queryFn: async () => {
      // Set userId scope for reading
      if (isAuthenticated && user) {
        localRepository.setCurrentUserId(user.sub);
      } else {
        localRepository.setCurrentUserId(LOCAL_USER_ID);
      }

      const orders = await localRepository.getAll();
      // Filter out soft-deleted orders
      return orders.filter((order) => !order.deletedAt);
    },
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Hook to update order status.
 * Writes to localStorage first, then syncs to cloud if authenticated.
 */
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const userId = useCurrentUserId();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const now = new Date().toISOString();

      // Always update local first
      localRepository.setCurrentUserId(userId);
      await localRepository.update(id, { status, updatedAt: now });

      // If authenticated, also update cloud (fire and forget, sync will fix any issues)
      if (isAuthenticated && apiRepository) {
        apiRepository.update(id, { status }).catch((err) => {
          console.warn('Failed to sync status update to cloud:', err);
        });
      }
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
      if (context?.previousOrders) {
        queryClient.setQueryData(ORDERS_KEY, context.previousOrders);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

/**
 * Hook to delete orders.
 * Deletes from localStorage first, then syncs to cloud if authenticated.
 */
export function useDeleteOrders() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const userId = useCurrentUserId();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const now = new Date().toISOString();

      localRepository.setCurrentUserId(userId);

      if (isAuthenticated && apiRepository) {
        // When authenticated: soft-delete locally (for sync tracking), delete from cloud
        for (const id of ids) {
          await localRepository.update(id, { deletedAt: now });
        }

        // Delete from cloud (fire and forget)
        for (const id of ids) {
          apiRepository.delete(id).catch((err) => {
            console.warn('Failed to delete from cloud:', err);
          });
        }
      } else {
        // When not authenticated: hard delete + track orderNumbers for later sync
        localRepository.setCurrentUserId(null); // Get all orders to find the ones to delete
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

      // Optimistically remove from UI
      queryClient.setQueryData<Order[]>(ORDERS_KEY, (old) =>
        old?.filter((order) => !ids.includes(order.id))
      );

      return { previousOrders };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(ORDERS_KEY, context.previousOrders);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

/**
 * Hook to save a new order.
 * Saves to localStorage - sync will upload to cloud.
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

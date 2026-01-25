import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { localRepository } from '@/config';
import { syncQueue } from '@/lib/syncQueue';
import { ORDERS_KEY } from '@/constants';
import type { Order, OrderStatus } from '@/types';

/**
 * Local-First Order Management
 *
 * All reads/writes go to localStorage.
 * Cloud sync is handled separately by useCloudSync.
 */

/**
 * Read orders from localStorage
 */
export function useOrders() {
  const { isLoading } = useAuth();

  return useQuery({
    queryKey: ORDERS_KEY,
    queryFn: async () => {
      const orders = await localRepository.getAll();
      return orders.filter((order) => !order.deletedAt);
    },
    staleTime: 1000 * 60,
    enabled: !isLoading,
  });
}

/**
 * Update order status
 */
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const updatedAt = new Date().toISOString();

      // Update locally first (offline-first)
      await localRepository.update(id, { status, updatedAt });

      // Queue for cloud sync (non-blocking)
      if (isAuthenticated) {
        syncQueue.add({ type: 'update', orderId: id, data: { status, updatedAt } });
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

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const deletedAt = new Date().toISOString();

      if (isAuthenticated) {
        // Soft delete locally, queue for cloud sync
        for (const id of ids) {
          await localRepository.update(id, { deletedAt });
          syncQueue.add({ type: 'delete', orderId: id });
        }
      } else {
        // Not authenticated - track for later sync, delete locally
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

  return useMutation({
    mutationFn: async (order: Order) => {
      await localRepository.save(order);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

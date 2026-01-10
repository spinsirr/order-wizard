import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { localRepository } from '@/config';
import { ORDERS_KEY, LOCAL_USER_ID } from '@/constants';
import type { Order, OrderStatus } from '@/types';

/**
 * Local-First Order Management
 *
 * All reads/writes go to localStorage.
 * Cloud sync is handled separately by useCloudSync.
 */

function useOrdersQueryKey(): readonly [string, string] {
  const { isAuthenticated, user } = useAuth();
  const userId = isAuthenticated && user ? user.sub : LOCAL_USER_ID;
  return [...ORDERS_KEY, userId] as const;
}

function useCurrentUserId(): string {
  const { isAuthenticated, user } = useAuth();
  return isAuthenticated && user ? user.sub : LOCAL_USER_ID;
}

/**
 * Read orders from localStorage
 */
export function useOrders() {
  const { isLoading } = useAuth();
  const queryKey = useOrdersQueryKey();
  const userId = useCurrentUserId();

  return useQuery({
    queryKey,
    queryFn: async () => {
      localRepository.setCurrentUserId(userId);
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
  const queryKey = useOrdersQueryKey();
  const userId = useCurrentUserId();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      localRepository.setCurrentUserId(userId);
      await localRepository.update(id, { status, updatedAt: new Date().toISOString() });
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousOrders = queryClient.getQueryData<Order[]>(queryKey);
      queryClient.setQueryData<Order[]>(queryKey, (old) =>
        old?.map((order) => (order.id === id ? { ...order, status } : order))
      );
      return { previousOrders };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousOrders) queryClient.setQueryData(queryKey, context.previousOrders);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      // Sync triggered automatically via chrome.storage.onChanged
    },
  });
}

/**
 * Delete orders
 */
export function useDeleteOrders() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const queryKey = useOrdersQueryKey();
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
      await queryClient.cancelQueries({ queryKey });
      const previousOrders = queryClient.getQueryData<Order[]>(queryKey);
      queryClient.setQueryData<Order[]>(queryKey, (old) =>
        old?.filter((order) => !ids.includes(order.id))
      );
      return { previousOrders };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousOrders) queryClient.setQueryData(queryKey, context.previousOrders);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      // Sync triggered automatically via chrome.storage.onChanged
    },
  });
}

/**
 * Save a new order
 */
export function useSaveOrder() {
  const queryClient = useQueryClient();
  const queryKey = useOrdersQueryKey();
  const userId = useCurrentUserId();

  return useMutation({
    mutationFn: async (order: Order) => {
      localRepository.setCurrentUserId(userId);
      await localRepository.save(order);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

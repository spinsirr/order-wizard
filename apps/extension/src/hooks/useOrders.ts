import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { localRepository, apiRepository } from '@/config';
import type { Order, OrderStatus } from '@/types';

const ORDERS_KEY = ['orders'] as const;

const LOCAL_USER_ID = 'local';

/**
 * Returns the appropriate repository based on auth state.
 * - Authenticated: Use API repository (cloud)
 * - Not authenticated: Use local storage scoped to 'local' userId
 */
function useRepository() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated && apiRepository) {
    return apiRepository;
  }

  // When not authenticated, scope to 'local' userId
  localRepository.setCurrentUserId(LOCAL_USER_ID);
  return localRepository;
}

export function useOrders() {
  const repository = useRepository();

  return useQuery({
    queryKey: ORDERS_KEY,
    queryFn: async () => {
      const orders = await repository.getAll();
      // Filter out soft-deleted orders
      return orders.filter((order) => !order.deletedAt);
    },
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  const repository = useRepository();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      repository.update(id, { status }),
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

export function useDeleteOrders() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const now = new Date().toISOString();

      if (isAuthenticated && apiRepository) {
        // When authenticated: delete from cloud immediately, soft-delete locally for sync tracking
        const api = apiRepository;
        await Promise.all([
          ...ids.map((id) => api.delete(id)),
          ...ids.map((id) => localRepository.update(id, { deletedAt: now })),
        ]);
      } else {
        // When not authenticated: hard delete + track orderNumbers for sync
        localRepository.setCurrentUserId(null); // Get all orders to find the ones to delete
        const orders = await localRepository.getAll();
        const ordersToDelete = orders.filter((o) => ids.includes(o.id));

        for (const order of ordersToDelete) {
          // Track the orderNumber so we can delete from cloud on sync
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

export function useSaveOrder() {
  const queryClient = useQueryClient();
  const repository = useRepository();

  return useMutation({
    mutationFn: (order: Order) => repository.save(order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

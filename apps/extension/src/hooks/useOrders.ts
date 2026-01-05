import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { localRepository, apiRepository } from '@/config';
import type { Order, OrderStatus } from '@/types';

const ORDERS_KEY = ['orders'] as const;

/**
 * Returns the appropriate repository based on auth state.
 * - Authenticated: Use API repository (cloud)
 * - Not authenticated: Use local storage
 */
function useRepository() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated && apiRepository ? apiRepository : localRepository;
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
        // When offline: soft-delete locally (will sync deletion later)
        await Promise.all(ids.map((id) => localRepository.update(id, { deletedAt: now })));
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

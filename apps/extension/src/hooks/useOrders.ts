import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orderRepository } from '@/config';
import type { Order, OrderStatus } from '@/types';

const ORDERS_KEY = ['orders'] as const;

export function useOrders() {
  return useQuery({
    queryKey: ORDERS_KEY,
    queryFn: () => orderRepository.getAll(),
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      orderRepository.update(id, { status }),
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

  return useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => orderRepository.delete(id)));
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

  return useMutation({
    mutationFn: (order: Order) => orderRepository.save(order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

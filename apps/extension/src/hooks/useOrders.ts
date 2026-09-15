import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ORDERS_KEY } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { localRepository } from '@/repositories';
import type { OrderStatus } from '@/types';

/** Read the active account’s local replica. The broker owns persisted versions. */
export function useOrders() {
  const { isLoading, workspaceUserId } = useAuth();

  return useQuery({
    queryKey: [...ORDERS_KEY, workspaceUserId],
    queryFn: async () => {
      const orders = await localRepository.getAll(workspaceUserId);
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
  const { workspaceUserId } = useAuth();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      await localRepository.update(id, { status }, workspaceUserId);
    },
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

/**
 * Update order note
 */
export function useUpdateOrderNote() {
  const queryClient = useQueryClient();
  const { workspaceUserId } = useAuth();

  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const nextNote = note.trim() ? note : '';

      await localRepository.update(id, { note: nextNote }, workspaceUserId);
    },
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

/**
 * Delete orders (unified soft delete)
 */
export function useDeleteOrders() {
  const queryClient = useQueryClient();
  const { workspaceUserId } = useAuth();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) {
        return;
      }
      const now = new Date().toISOString();

      // Single read-modify-write pass for the whole batch.
      await localRepository.updateMany(ids, { deletedAt: now }, workspaceUserId);
    },
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

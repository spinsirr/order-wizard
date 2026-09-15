import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { Order, OrderStatus } from '@/types';

type OrderEvent = { type: 'status' | 'note' | 'delete'; ids: string[]; value?: string };
interface MockOrders {
  orders: Order[];
  isLoading: boolean;
  setOrders: Dispatch<SetStateAction<Order[]>>;
  onChange: (event: OrderEvent) => void;
}

const OrdersContext = createContext<MockOrders | null>(null);

export function MockOrdersProvider({
  initialOrders,
  isLoading,
  onChange,
  children,
}: {
  initialOrders: Order[];
  isLoading: boolean;
  onChange: (event: OrderEvent) => void;
  children: ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [orders, setOrders] = useState(() => structuredClone(initialOrders));
  const value = useMemo(
    () => ({ orders, setOrders, isLoading, onChange }),
    [orders, isLoading, onChange],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
    </QueryClientProvider>
  );
}

function useMockOrders() {
  const context = useContext(OrdersContext);
  if (!context) {
    throw new Error('Order list stories require MockOrdersProvider.');
  }
  return context;
}

export function useOrders() {
  const { orders, isLoading } = useMockOrders();
  return { data: orders, isLoading, error: null, refetch: async () => {} };
}

export function useUpdateOrderStatus() {
  const { setOrders, onChange } = useMockOrders();
  const mutate = useCallback(
    ({ id, status }: { id: string; status: OrderStatus }) => {
      setOrders((orders) =>
        orders.map((order) => (order.id === id ? { ...order, status } : order)),
      );
      onChange({ type: 'status', ids: [id], value: status });
    },
    [setOrders, onChange],
  );
  return { mutate, error: null };
}

export function useUpdateOrderNote() {
  const { setOrders, onChange } = useMockOrders();
  const mutate = useCallback(
    ({ id, note }: { id: string; note: string }) => {
      setOrders((orders) =>
        orders.map((order) =>
          order.id === id ? { ...order, note: note.trim() ? note : undefined } : order,
        ),
      );
      onChange({ type: 'note', ids: [id], value: note });
    },
    [setOrders, onChange],
  );
  return { mutate, error: null };
}

export function useDeleteOrders() {
  const { setOrders, onChange } = useMockOrders();
  const mutate = useCallback(
    (ids: string[], options?: { onSuccess: () => void }) => {
      setOrders((orders) => orders.filter((order) => !ids.includes(order.id)));
      onChange({ type: 'delete', ids });
      options?.onSuccess();
    },
    [setOrders, onChange],
  );
  return { mutate, isPending: false, error: null, reset: () => {} };
}

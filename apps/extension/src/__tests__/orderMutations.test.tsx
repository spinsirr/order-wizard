// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ORDERS_KEY } from '@/constants';
import {
  useDeleteOrders,
  useOrders,
  useUpdateOrderNote,
  useUpdateOrderStatus,
} from '@/hooks/useOrders';
import { LocalStorageRepository } from '@/repositories/LocalStorageRepository';
import { installBrowser, makeOrder } from './browser';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isLoading: false, workspaceUserId: 'account-a' }),
}));
vi.mock('@/repositories', async () => {
  const { LocalStorageRepository } = await import('@/repositories/LocalStorageRepository');
  return { localRepository: new LocalStorageRepository() };
});
const repository = new LocalStorageRepository();
let queryClient: QueryClient;
let browser: ReturnType<typeof installBrowser>;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
beforeEach(async () => {
  browser = installBrowser();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await repository.save(makeOrder());
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('preserves a concurrent successful edit when another local mutation fails', async () => {
  const { result } = renderHook(
    () => ({ orders: useOrders(), note: useUpdateOrderNote(), status: useUpdateOrderStatus() }),
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(result.current.orders.data).toHaveLength(1));
  const failure = Promise.withResolvers<void>();
  vi.spyOn(browser.storage.local, 'set').mockImplementationOnce(() => failure.promise);
  await act(async () => {
    const note = result.current.note.mutateAsync({ id: makeOrder().id, note: 'not saved' });
    const rejected = expect(note).rejects.toThrow('Storage quota exceeded');
    const status = result.current.status.mutateAsync({ id: makeOrder().id, status: 'reimbursed' });
    failure.reject(new Error('Storage quota exceeded'));
    await Promise.all([rejected, status]);
  });
  await waitFor(() => {
    expect(result.current.note.error?.message).toBe('Storage quota exceeded');
    expect(result.current.orders.data?.[0]?.status).toBe('reimbursed');
  });
  expect(result.current.orders.data?.[0]?.note).toBeUndefined();
  expect(queryClient.getQueryData([...ORDERS_KEY, 'account-a'])).toEqual(
    await repository.getAll('account-a'),
  );
});

it('keeps an order and its outbox when deletion cannot commit', async () => {
  const { result } = renderHook(useDeleteOrders, { wrapper: Wrapper });
  const before = await chrome.storage.local.get(null);
  vi.spyOn(browser.storage.local, 'set').mockRejectedValueOnce(new Error('Storage unavailable'));
  await act(async () => {
    await expect(result.current.mutateAsync([makeOrder().id])).rejects.toThrow(
      'Storage unavailable',
    );
  });
  await waitFor(() => expect(result.current.error?.message).toBe('Storage unavailable'));
  expect(await chrome.storage.local.get(null)).toEqual(before);
});

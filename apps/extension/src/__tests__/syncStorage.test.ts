import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeOrderStorageCommand } from '@/background/orderStorage';
import { mutateOrderStorage, orderTime } from '@/lib/orderStorage';
import { syncQueue } from '@/lib/syncQueue';
import { LocalStorageRepository } from '@/repositories/LocalStorageRepository';
import type { Order } from '@/types';
import { installBrowser, makeOrder, makeSession } from './browser';

const api = vi.hoisted(() => ({
  saveBatch: vi.fn<(orders: Order[]) => Promise<void>>(),
  withAccessToken: vi.fn(),
}));
vi.mock('@/repositories', () => ({ apiRepository: api }));
const repository = new LocalStorageRepository();

beforeEach(async () => {
  vi.resetAllMocks();
  installBrowser();
  api.withAccessToken.mockReturnValue(api);
  api.saveBatch.mockResolvedValue(undefined);
  await chrome.storage.local.set({ auth_user: makeSession() });
});
afterEach(() => vi.unstubAllGlobals());

describe('order storage and durable outbox', () => {
  it('preserves concurrently saved orders and their outbox operations', async () => {
    await Promise.all([
      repository.save(makeOrder()),
      repository.save(makeOrder({ id: 'second', orderNumber: 'second' })),
    ]);
    expect(await repository.getAll('account-a')).toHaveLength(2);
    expect(await syncQueue.getPendingCount('account-a')).toBe(2);
  });

  it('keeps identical order numbers separate between accounts and confines edits', async () => {
    await repository.save(makeOrder());
    await repository.save(makeOrder({ userId: 'account-b' }));
    await repository.update(makeOrder().id, { note: 'Only A' }, 'account-a');
    expect((await repository.getAll('account-a'))[0]?.note).toBe('Only A');
    expect((await repository.getAll('account-b'))[0]?.note).toBeUndefined();
  });

  it('claims anonymous orders without moving already owned records', async () => {
    await repository.save(makeOrder());
    await repository.save(
      makeOrder({ id: 'anonymous', orderNumber: 'anonymous', userId: 'local' }),
    );
    await mutateOrderStorage({ kind: 'claim-local', userId: 'account-b' });
    expect((await repository.getAll('account-a'))[0]?.id).toBe(makeOrder().id);
    expect((await repository.getAll('account-b'))[0]?.id).toBe('anonymous');
    expect(await repository.getAll('local')).toEqual([]);
  });

  it('uploads a newer edit made while an older snapshot is in flight', async () => {
    const upload = Promise.withResolvers<void>();
    api.saveBatch.mockReturnValueOnce(upload.promise);
    await repository.save(makeOrder());
    const syncing = syncQueue.process('account-a');
    await vi.waitFor(() => expect(api.saveBatch).toHaveBeenCalledOnce());
    await repository.update(makeOrder().id, { note: 'New edit' }, 'account-a');
    upload.resolve();
    await syncing;
    expect(api.saveBatch).toHaveBeenCalledTimes(2);
    expect(api.saveBatch.mock.calls[1]?.[0][0]?.note).toBe('New edit');
    expect(await syncQueue.getPendingCount('account-a')).toBe(0);
  });

  it('retains a deleted order and its pending tombstone after upload failure', async () => {
    await repository.save(makeOrder());
    await repository.update(makeOrder().id, { deletedAt: new Date().toISOString() }, 'account-a');
    api.saveBatch.mockRejectedValue(new Error('Offline'));
    await expect(syncQueue.process('account-a')).rejects.toThrow('Offline');
    expect((await repository.getAll('account-a'))[0]?.deletedAt).toBeTruthy();
    expect((await syncQueue.getQueue('account-a'))[0]?.operation.order.deletedAt).toBeTruthy();
  });

  it('compares fractional timestamps exactly when merging cloud snapshots', async () => {
    await repository.save(
      makeOrder({ updatedAt: '2026-09-15T12:00:00.123456789Z', note: 'newer' }),
    );
    await repository.saveBatch([
      makeOrder({ updatedAt: '2026-09-15T12:00:00.123Z', note: 'stale' }),
    ]);
    expect((await repository.getAll('account-a'))[0]?.note).toBe('newer');
    await repository.saveBatch([
      makeOrder({ updatedAt: '2026-09-15T05:00:00.123456790-07:00', note: 'latest' }),
    ]);
    expect((await repository.getAll('account-a'))[0]?.note).toBe('latest');
  });

  it('advances edits and deletion past a future cloud version despite a slower device clock', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-15T12:00:00Z'));
    try {
      await repository.saveBatch([makeOrder({ updatedAt: '2026-09-15T12:05:00.123456789Z' })]);
      await repository.update(makeOrder().id, { note: 'after cloud' }, 'account-a');
      expect((await repository.getAll('account-a'))[0]?.updatedAt).toBe(
        '2026-09-15T12:05:00.12345679Z',
      );
      await repository.update(makeOrder().id, { deletedAt: new Date().toISOString() }, 'account-a');
      const deleted = (await repository.getAll('account-a'))[0];
      expect(deleted?.updatedAt).toBe('2026-09-15T12:05:00.123456791Z');
      expect(deleted?.deletedAt).toBe(deleted?.updatedAt);
      await repository.saveBatch([makeOrder({ updatedAt: '2026-09-15T12:05:00.12345679Z' })]);
      expect((await repository.getAll('account-a'))[0]?.deletedAt).toBe(deleted?.deletedAt);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('enqueues a recovery batch in one storage commit', async () => {
    const commit = vi.spyOn(chrome.storage.local, 'set');
    try {
      await syncQueue.enqueue([makeOrder(), makeOrder({ id: 'second', orderNumber: 'second' })]);
      expect(commit).toHaveBeenCalledOnce();
      expect(await syncQueue.getPendingCount('account-a')).toBe(2);
    } finally {
      commit.mockRestore();
    }
  });

  it('rejects stale recovery snapshots and uploads only the active account', async () => {
    const old = makeOrder();
    await repository.save(old);
    await repository.update(old.id, { note: 'Current' }, 'account-a');
    await syncQueue.enqueue([old]);
    await repository.save(makeOrder({ userId: 'account-b' }));
    await syncQueue.process('account-a');
    expect(api.withAccessToken).toHaveBeenCalledWith('access-a');
    expect(api.saveBatch).toHaveBeenCalledWith([
      expect.objectContaining({ userId: 'account-a', note: 'Current' }),
    ]);
    expect(await syncQueue.getPendingCount('account-b')).toBe(1);
  });
  it('rejects immutable field updates and malformed stored orders before any write', async () => {
    await repository.save(makeOrder());
    const before = await chrome.storage.local.get(null);
    await expect(
      executeOrderStorageCommand({
        kind: 'update',
        ids: [makeOrder().id],
        userId: 'account-a',
        updates: { userId: 'account-b' },
      }),
    ).rejects.toThrow();
    expect(await chrome.storage.local.get(null)).toEqual(before);
    await chrome.storage.local.set({ orders: [{ ...makeOrder(), updatedAt: 'not-a-date' }] });
    await expect(
      repository.update(makeOrder().id, { note: 'new note' }, 'account-a'),
    ).rejects.toThrow();
    expect((await chrome.storage.local.get('sync_queue'))['sync_queue']).toEqual(
      before['sync_queue'],
    );
  });

  it('retains unowned legacy deletions without uploading them under the active account', async () => {
    const legacy = {
      id: 'old-delete',
      operation: { type: 'delete', orderId: 'old', orderNumber: 'old' },
      createdAt: '2026-01-01T00:00:00Z',
      retryCount: 2,
    };
    await chrome.storage.local.set({ sync_queue: [legacy] });
    await repository.save(makeOrder());
    await syncQueue.process('account-a');
    expect(api.saveBatch).toHaveBeenCalledWith([makeOrder()]);
    expect((await chrome.storage.local.get('sync_queue'))['sync_queue']).toEqual([legacy]);
  });

  it('keeps a saved identity and edits when another tab captures the same order', async () => {
    await repository.save(makeOrder());
    await repository.update(makeOrder().id, { note: 'keep me' }, 'account-a');
    const saved = await repository.save(makeOrder({ id: 'duplicate', note: 'old note' }));
    expect(saved.id).toBe(makeOrder().id);
    expect(saved.note).toBe('keep me');
    expect(await repository.getAll('account-a')).toEqual([saved]);
  });

  it('restores a deliberately recaptured order after a future tombstone', async () => {
    const deleted = makeOrder({
      updatedAt: '2099-01-01T00:00:00.123456789Z',
      deletedAt: '2099-01-01T00:00:00.123456789Z',
    });
    await repository.saveBatch([deleted]);
    const saved = await repository.save(makeOrder({ id: 'new-capture' }));
    expect(saved.id).toBe(deleted.id);
    expect(saved.deletedAt).toBeUndefined();
    expect(orderTime(saved)).toBe(orderTime(deleted) + 1n);
    expect((await syncQueue.getQueue('account-a'))[0]?.operation.order).toEqual(saved);
  });

  it('reports malformed broker responses instead of accepting an unchecked cast', async () => {
    const browser = installBrowser();
    const message = vi
      .spyOn(browser.runtime, 'sendMessage')
      .mockResolvedValueOnce({ orders: 'broken' });
    try {
      await expect(mutateOrderStorage({ kind: 'acknowledge', ids: [] })).rejects.toThrow();
    } finally {
      message.mockRestore();
    }
  });
});

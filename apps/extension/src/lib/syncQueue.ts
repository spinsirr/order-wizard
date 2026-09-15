import { AUTH_STORAGE_KEY } from '@/constants';
import { mutateOrderStorage, type QueueItem, StoredQueueSchema } from '@/lib/orderStorage';
import { apiRepository } from '@/repositories';
import type { AuthUser, Order } from '@/types';

/** Durable outbox only. TanStack Query owns network retries and online/offline state. */
class SyncQueue {
  async getQueue(userId?: string): Promise<QueueItem[]> {
    const result = await chrome.storage.local.get('sync_queue');
    const queue = StoredQueueSchema.parse(result['sync_queue'] ?? []);
    return queue.filter(
      (item): item is QueueItem =>
        item.operation.type === 'upsert' && (!userId || item.operation.order.userId === userId),
    );
  }

  async enqueue(orders: Order[]): Promise<void> {
    if (orders.length) {
      await mutateOrderStorage({ kind: 'enqueue', orders });
    }
  }

  async process(userId: string): Promise<void> {
    if (!apiRepository) {
      return;
    }
    for (;;) {
      const stored = await chrome.storage.local.get<{ auth_user?: AuthUser }>(AUTH_STORAGE_KEY);
      const user: AuthUser | undefined = stored[AUTH_STORAGE_KEY];
      if (user?.sub !== userId || user.expires_at <= Date.now()) {
        throw new Error('Sign in to resume sync');
      }
      const queue = await this.getQueue(userId);
      if (!queue.length) {
        return;
      }
      // Bind every batch, including its chunks, to this session. Account switches cannot reassign writes.
      await apiRepository
        .withAccessToken(user.access_token)
        .saveBatch(queue.map((item) => item.operation.order));
      // Only acknowledge this snapshot. A later edit has a different operation ID and stays pending.
      await mutateOrderStorage({ kind: 'acknowledge', ids: queue.map((item) => item.id) });
    }
  }

  async getPendingCount(userId?: string): Promise<number> {
    return (await this.getQueue(userId)).length;
  }
}

export const syncQueue = new SyncQueue();

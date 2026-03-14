import { apiRepository } from '@/config';
import type { Order } from '@/types';

const SYNC_QUEUE_KEY = 'sync_queue';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // Exponential backoff

// Simplified operation types: upsert (create or update) and delete
export type SyncOperation =
  | { type: 'upsert'; order: Order }
  | { type: 'delete'; orderId: string; orderNumber: string };

interface QueueItem {
  id: string;
  operation: SyncOperation;
  retryCount: number;
  createdAt: string;
}

class SyncQueue {
  private processing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<() => void> = new Set();
  private cachedCount = 0;
  private hydrated = false;

  async getQueue(): Promise<QueueItem[]> {
    const result = await chrome.storage.local.get(SYNC_QUEUE_KEY);
    return (result[SYNC_QUEUE_KEY] as QueueItem[]) || [];
  }

  private async saveQueue(queue: QueueItem[]): Promise<void> {
    await chrome.storage.local.set({ [SYNC_QUEUE_KEY]: queue });
    this.cachedCount = queue.length;
  }

  async add(operation: SyncOperation): Promise<void> {
    const queue = await this.getQueue();

    // Dedupe by orderNumber: remove existing operation for same order
    const orderNumber = operation.type === 'upsert'
      ? operation.order.orderNumber
      : operation.orderNumber;

    const filtered = queue.filter((item) => {
      const itemOrderNumber = item.operation.type === 'upsert'
        ? item.operation.order.orderNumber
        : item.operation.orderNumber;
      return itemOrderNumber !== orderNumber;
    });

    filtered.push({
      id: crypto.randomUUID(),
      operation,
      retryCount: 0,
      createdAt: new Date().toISOString(),
    });

    await this.saveQueue(filtered);
    this.notifyListeners();

    // Cancel any pending retry — we'll process the full queue now
    this.cancelRetryTimer();

    // Try to process immediately
    this.process();
  }

  async process(): Promise<void> {
    if (this.processing || !apiRepository) return;

    this.processing = true;
    this.cancelRetryTimer();
    console.log('[SyncQueue] Processing queue...');

    try {
      const queue = await this.getQueue();
      if (queue.length === 0) {
        console.log('[SyncQueue] Queue empty');
        return;
      }

      // Separate into upserts and deletes for batch processing
      const upsertItems = queue.filter((item) => item.operation.type === 'upsert');
      const deleteItems = queue.filter((item) => item.operation.type === 'delete');
      const remaining: QueueItem[] = [];

      // Batch upserts
      if (upsertItems.length > 0) {
        try {
          const orders = upsertItems.map((item) => (item.operation as { type: 'upsert'; order: Order }).order);
          await apiRepository.saveBatch(orders);
          console.log(`[SyncQueue] Batch upserted ${upsertItems.length} orders`);
        } catch (error) {
          console.warn('[SyncQueue] Batch upsert failed, falling back to individual:', error);
          // Fallback: try individually
          for (const item of upsertItems) {
            try {
              await apiRepository.save((item.operation as { type: 'upsert'; order: Order }).order);
            } catch {
              if (item.retryCount < MAX_RETRIES) {
                remaining.push({ ...item, retryCount: item.retryCount + 1 });
              } else {
                console.error('[SyncQueue] Max retries exceeded, dropping:', item.id);
              }
            }
          }
        }
      }

      // Batch deletes
      if (deleteItems.length > 0) {
        try {
          const ids = deleteItems.map((item) => (item.operation as { type: 'delete'; orderId: string }).orderId);
          await apiRepository.deleteBatchRemote(ids);
          console.log(`[SyncQueue] Batch deleted ${deleteItems.length} orders`);
        } catch (error) {
          console.warn('[SyncQueue] Batch delete failed, falling back to individual:', error);
          // Fallback: try individually
          for (const item of deleteItems) {
            try {
              await apiRepository.delete((item.operation as { type: 'delete'; orderId: string }).orderId);
            } catch {
              if (item.retryCount < MAX_RETRIES) {
                remaining.push({ ...item, retryCount: item.retryCount + 1 });
              } else {
                console.error('[SyncQueue] Max retries exceeded, dropping:', item.id);
              }
            }
          }
        }
      }

      await this.saveQueue(remaining);
      this.notifyListeners();

      // Schedule retry for remaining items
      if (remaining.length > 0) {
        const minRetryCount = Math.min(...remaining.map((item) => item.retryCount));
        const delay = RETRY_DELAYS[Math.min(minRetryCount - 1, RETRY_DELAYS.length - 1)];
        console.log(`[SyncQueue] Retrying ${remaining.length} items in ${delay}ms`);
        this.retryTimer = setTimeout(() => this.process(), delay);
      }
    } finally {
      this.processing = false;
    }
  }

  async getPendingCount(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  }

  async clear(): Promise<void> {
    this.cancelRetryTimer();
    await this.saveQueue([]);
    this.notifyListeners();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    const queue = await this.getQueue();
    this.cachedCount = queue.length;
    this.hydrated = true;
  }

  getSnapshot(): number {
    return this.cachedCount;
  }

  getServerSnapshot(): number {
    return 0;
  }

  private cancelRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private notifyListeners(): void {
    for (const fn of this.listeners) {
      fn();
    }
  }
}

export const syncQueue = new SyncQueue();

import { apiRepository } from '@/config';
import type { Order, OrderStatus } from '@/types';

const SYNC_QUEUE_KEY = 'sync_queue';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // Exponential backoff

export type SyncOperation =
  | { type: 'create'; order: Order }
  | { type: 'update'; orderId: string; data: { status?: OrderStatus; note?: string; updatedAt: string; deletedAt?: string } }
  | { type: 'delete'; orderId: string };

interface QueueItem {
  id: string;
  operation: SyncOperation;
  retryCount: number;
  createdAt: string;
}

class SyncQueue {
  private processing = false;
  private listeners: Set<() => void> = new Set();

  async getQueue(): Promise<QueueItem[]> {
    const result = await chrome.storage.local.get(SYNC_QUEUE_KEY);
    return (result[SYNC_QUEUE_KEY] as QueueItem[]) || [];
  }

  private async saveQueue(queue: QueueItem[]): Promise<void> {
    await chrome.storage.local.set({ [SYNC_QUEUE_KEY]: queue });
  }

  async add(operation: SyncOperation): Promise<void> {
    const queue = await this.getQueue();

    // Dedupe: remove existing operation for same orderId
    const orderId = operation.type === 'create' ? operation.order.id : operation.orderId;
    const filtered = queue.filter((item) => {
      const itemOrderId = item.operation.type === 'create'
        ? item.operation.order.id
        : item.operation.orderId;
      return itemOrderId !== orderId;
    });

    filtered.push({
      id: crypto.randomUUID(),
      operation,
      retryCount: 0,
      createdAt: new Date().toISOString(),
    });

    await this.saveQueue(filtered);
    this.notifyListeners();

    // Try to process immediately
    this.process();
  }

  async process(): Promise<void> {
    if (this.processing || !apiRepository) return;

    this.processing = true;
    console.log('[SyncQueue] Processing queue...');

    try {
      const queue = await this.getQueue();
      if (queue.length === 0) {
        console.log('[SyncQueue] Queue empty');
        return;
      }

      const remaining: QueueItem[] = [];

      for (const item of queue) {
        try {
          await this.executeOperation(item.operation);
          console.log('[SyncQueue] Synced:', item.operation.type, item.id);
        } catch (error) {
          console.warn('[SyncQueue] Failed:', item.operation.type, error);

          if (item.retryCount < MAX_RETRIES) {
            remaining.push({ ...item, retryCount: item.retryCount + 1 });
          } else {
            console.error('[SyncQueue] Max retries exceeded, dropping:', item.id);
          }
        }
      }

      await this.saveQueue(remaining);
      this.notifyListeners();

      // Schedule retry for remaining items
      if (remaining.length > 0) {
        const delay = RETRY_DELAYS[Math.min(remaining[0].retryCount - 1, RETRY_DELAYS.length - 1)];
        console.log(`[SyncQueue] Retrying ${remaining.length} items in ${delay}ms`);
        setTimeout(() => this.process(), delay);
      }
    } finally {
      this.processing = false;
    }
  }

  private async executeOperation(op: SyncOperation): Promise<void> {
    if (!apiRepository) throw new Error('API not available');

    switch (op.type) {
      case 'create':
        await apiRepository.save(op.order);
        break;
      case 'update':
        await apiRepository.update(op.orderId, op.data);
        break;
      case 'delete':
        await apiRepository.delete(op.orderId);
        break;
    }
  }

  async getPendingCount(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  }

  async clear(): Promise<void> {
    await this.saveQueue([]);
    this.notifyListeners();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const fn of this.listeners) {
      fn();
    }
  }
}

export const syncQueue = new SyncQueue();

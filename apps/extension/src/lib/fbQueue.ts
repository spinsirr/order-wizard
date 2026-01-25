import type { FBQueueItem, FBListingData, QueueItemStatus } from '@/types';

const FB_QUEUE_KEY = 'fb_listing_queue';

type QueueListener = (queue: FBQueueItem[]) => void;

class FBQueue {
  private listeners: Set<QueueListener> = new Set();
  private cachedQueue: FBQueueItem[] = [];
  private hydrated = false;
  private paused = false;

  async getQueue(): Promise<FBQueueItem[]> {
    const result = await chrome.storage.local.get(FB_QUEUE_KEY);
    return (result[FB_QUEUE_KEY] as FBQueueItem[]) || [];
  }

  private async saveQueue(queue: FBQueueItem[]): Promise<void> {
    await chrome.storage.local.set({ [FB_QUEUE_KEY]: queue });
    this.cachedQueue = queue;
    this.notifyListeners();
  }

  async add(listing: FBListingData): Promise<string> {
    const queue = await this.getQueue();
    const id = crypto.randomUUID();

    queue.push({
      id,
      listing,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    await this.saveQueue(queue);
    return id;
  }

  async addBatch(listings: FBListingData[]): Promise<string[]> {
    const queue = await this.getQueue();
    const ids: string[] = [];

    for (const listing of listings) {
      const id = crypto.randomUUID();
      ids.push(id);
      queue.push({
        id,
        listing,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }

    await this.saveQueue(queue);
    return ids;
  }

  async updateStatus(id: string, status: QueueItemStatus, error?: string): Promise<void> {
    const queue = await this.getQueue();
    const index = queue.findIndex((item) => item.id === id);

    if (index !== -1) {
      queue[index] = { ...queue[index], status, error };
      await this.saveQueue(queue);
    }
  }

  async remove(id: string): Promise<void> {
    const queue = await this.getQueue();
    const filtered = queue.filter((item) => item.id !== id);
    await this.saveQueue(filtered);
  }

  async clear(): Promise<void> {
    await this.saveQueue([]);
  }

  async getNext(): Promise<FBQueueItem | null> {
    if (this.paused) return null;
    const queue = await this.getQueue();
    return queue.find((item) => item.status === 'pending') || null;
  }

  async getCurrentFilling(): Promise<FBQueueItem | null> {
    const queue = await this.getQueue();
    return queue.find((item) => item.status === 'filling') || null;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  isPaused(): boolean {
    return this.paused;
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    this.getQueue().then(listener);
    return () => this.listeners.delete(listener);
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.cachedQueue = await this.getQueue();
    this.hydrated = true;
  }

  getSnapshot(): FBQueueItem[] {
    return this.cachedQueue;
  }

  private notifyListeners(): void {
    for (const fn of this.listeners) {
      fn(this.cachedQueue);
    }
  }
}

export const fbQueue = new FBQueue();

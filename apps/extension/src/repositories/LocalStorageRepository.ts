import { mutateOrderStorage } from '@/lib/orderStorage';
import { OrderSchema, type OrderUpdates } from '@/schemas/order';
import type { Order } from '@/types';

export class LocalStorageRepository {
  async getAll(userId?: string): Promise<Order[]> {
    const result = await chrome.storage.local.get('orders');
    const orders = OrderSchema.array().parse(result['orders'] ?? []);
    return userId ? orders.filter((order) => order.userId === userId) : orders;
  }

  async save(order: Order): Promise<Order> {
    const saved = (await mutateOrderStorage({ kind: 'save', orders: [order] })).orders[0];
    if (!saved) {
      throw new Error('Order storage did not return the saved order');
    }
    return saved;
  }

  /** Merge cloud snapshots without marking them as new local writes. */
  async saveBatch(orders: Order[]): Promise<void> {
    if (orders.length) {
      await mutateOrderStorage({ kind: 'save', orders, fromCloud: true });
    }
  }

  async update(id: string, updates: OrderUpdates, userId: string): Promise<void> {
    const changed = await this.updateMany([id], updates, userId);
    if (!changed.length) {
      throw new Error(`Order with id ${id} not found`);
    }
  }

  async updateMany(ids: string[], updates: OrderUpdates, userId: string): Promise<Order[]> {
    if (!ids.length) {
      return [];
    }
    return (await mutateOrderStorage({ kind: 'update', ids, updates, userId })).orders;
  }
}

import type { Order } from '@/types';

export class LocalStorageRepository {
  private readonly STORAGE_KEY = 'orders';

  private async getAllOrders(): Promise<Order[]> {
    const result = await chrome.storage.local.get(this.STORAGE_KEY);
    return (result[this.STORAGE_KEY] as Order[]) || [];
  }

  private async saveAllOrders(orders: Order[]): Promise<void> {
    await chrome.storage.local.set({ [this.STORAGE_KEY]: orders });
  }

  async save(order: Order): Promise<void> {
    const orders = await this.getAllOrders();
    // Use orderNumber for dedup (cloud and local orders may have different ids)
    const existingIndex = orders.findIndex((o) => o.orderNumber === order.orderNumber);
    if (existingIndex !== -1) {
      orders[existingIndex] = order;
    } else {
      orders.push(order);
    }
    await this.saveAllOrders(orders);
  }

  async getAll(): Promise<Order[]> {
    return this.getAllOrders();
  }

  async update(id: string, updates: Partial<Order>): Promise<void> {
    const orders = await this.getAllOrders();
    const index = orders.findIndex((order) => order.id === id);

    if (index === -1) {
      throw new Error(`Order with id ${id} not found`);
    }

    orders[index] = { ...orders[index], ...updates };
    await this.saveAllOrders(orders);
  }

  async delete(id: string): Promise<void> {
    const orders = await this.getAllOrders();
    const filtered = orders.filter((order) => order.id !== id);
    await this.saveAllOrders(filtered);
  }

  async getById(id: string): Promise<Order | null> {
    const orders = await this.getAllOrders();
    return orders.find((order) => order.id === id) || null;
  }
}

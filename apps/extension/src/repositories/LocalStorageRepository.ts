import type { Order } from '@/types';

export class LocalStorageRepository {
  private readonly STORAGE_KEY = 'orders';
  private readonly DELETED_ORDERS_KEY = 'deleted_order_numbers';

  private async getAllOrders(): Promise<Order[]> {
    const result = await chrome.storage.local.get(this.STORAGE_KEY);
    return (result[this.STORAGE_KEY] as Order[]) || [];
  }

  private async saveAllOrders(orders: Order[]): Promise<void> {
    await chrome.storage.local.set({ [this.STORAGE_KEY]: orders });
  }

  async trackDeletedOrderNumber(orderNumber: string): Promise<void> {
    const result = await chrome.storage.local.get(this.DELETED_ORDERS_KEY);
    const deleted = (result[this.DELETED_ORDERS_KEY] as string[]) || [];
    if (!deleted.includes(orderNumber)) {
      deleted.push(orderNumber);
      await chrome.storage.local.set({ [this.DELETED_ORDERS_KEY]: deleted });
    }
  }

  async getDeletedOrderNumbers(): Promise<string[]> {
    const result = await chrome.storage.local.get(this.DELETED_ORDERS_KEY);
    return (result[this.DELETED_ORDERS_KEY] as string[]) || [];
  }

  async clearDeletedOrderNumbers(): Promise<void> {
    await chrome.storage.local.remove(this.DELETED_ORDERS_KEY);
  }

  async removeDeletedOrderNumber(orderNumber: string): Promise<void> {
    const result = await chrome.storage.local.get(this.DELETED_ORDERS_KEY);
    const deleted = (result[this.DELETED_ORDERS_KEY] as string[]) || [];
    const filtered = deleted.filter((n) => n !== orderNumber);
    await chrome.storage.local.set({ [this.DELETED_ORDERS_KEY]: filtered });
  }

  async save(order: Order): Promise<void> {
    const orders = await this.getAllOrders();
    const existingIndex = orders.findIndex((o) => o.id === order.id);
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

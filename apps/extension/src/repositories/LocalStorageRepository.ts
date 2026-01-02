import type { Order } from '@/types/Order';

/**
 * LocalStorage implementation of Order Repository
 * Uses chrome.storage.local for persistence
 */
export class LocalStorageRepository {
  private readonly STORAGE_KEY = 'orders';
  private currentUserId: string | null = null;

  /**
   * Set the current user ID for filtering orders
   */
  setCurrentUserId(userId: string | null): void {
    this.currentUserId = userId;
  }

  /**
   * Get all orders from storage
   */
  private async getAllOrders(): Promise<Order[]> {
    const result = await chrome.storage.local.get(this.STORAGE_KEY);
    return (result[this.STORAGE_KEY] as Order[]) || [];
  }

  /**
   * Save all orders to storage
   */
  private async saveAllOrders(orders: Order[]): Promise<void> {
    await chrome.storage.local.set({ [this.STORAGE_KEY]: orders });
  }

  async save(order: Order): Promise<void> {
    const orders = await this.getAllOrders();
    orders.push(order);
    await this.saveAllOrders(orders);
  }

  async getAll(): Promise<Order[]> {
    const orders = await this.getAllOrders();
    if (!this.currentUserId) {
      return orders;
    }
    return orders.filter((order) => order.userId === this.currentUserId);
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

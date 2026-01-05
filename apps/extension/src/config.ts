import type { Order } from './types';

// ============================================================================
// Environment Variables
// ============================================================================

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

// ============================================================================
// Repository Classes
// ============================================================================

export class LocalStorageRepository {
  private readonly STORAGE_KEY = 'orders';
  private currentUserId: string | null = null;

  setCurrentUserId(userId: string | null): void {
    this.currentUserId = userId;
  }

  private async getAllOrders(): Promise<Order[]> {
    const result = await chrome.storage.local.get(this.STORAGE_KEY);
    return (result[this.STORAGE_KEY] as Order[]) || [];
  }

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

export class ApiRepository {
  private readonly baseUrl: string;
  private accessToken: string | null = null;
  private tokenType: string = 'Bearer';

  constructor(baseUrl: string = 'https://api.example.com') {
    this.baseUrl = baseUrl;
  }

  setAccessToken(token: string | null, tokenType?: string): void {
    this.accessToken = token;
    this.tokenType = tokenType || 'Bearer';
  }

  private buildHeaders(additional: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...additional };

    if (this.accessToken) {
      headers.Authorization = `${this.tokenType} ${this.accessToken}`;
    }

    return headers;
  }

  async save(order: Order): Promise<void> {
    const headers = this.buildHeaders({ 'Content-Type': 'application/json' });

    const response = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify(order),
    });

    if (!response.ok) {
      throw new Error(`Failed to save order: ${response.statusText}`);
    }
  }

  async getAll(): Promise<Order[]> {
    const headers = this.buildHeaders();
    const response = await fetch(`${this.baseUrl}/orders`, {
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch orders: ${response.statusText}`);
    }

    return response.json();
  }

  async update(id: string, updates: Partial<Order>): Promise<void> {
    const headers = this.buildHeaders({ 'Content-Type': 'application/json' });

    const response = await fetch(`${this.baseUrl}/orders/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error(`Failed to update order: ${response.statusText}`);
    }
  }

  async delete(id: string): Promise<void> {
    const headers = this.buildHeaders();
    const response = await fetch(`${this.baseUrl}/orders/${id}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to delete order: ${response.statusText}`);
    }
  }

  async getById(id: string): Promise<Order | null> {
    const headers = this.buildHeaders();
    const response = await fetch(`${this.baseUrl}/orders/${id}`, {
      headers,
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch order: ${response.statusText}`);
    }

    return response.json();
  }
}

// ============================================================================
// Repository Instances
// ============================================================================

// Local storage - always available, works without login
export const localRepository = new LocalStorageRepository();

// API repository - for cloud sync when authenticated
export const apiRepository = apiBaseUrl ? new ApiRepository(apiBaseUrl) : null;

// Default to local storage (backward compatible)
export const orderRepository = localRepository;

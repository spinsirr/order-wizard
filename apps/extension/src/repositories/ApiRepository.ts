import type { Order } from '@/types';

/**
 * API Repository - for cloud sync only
 *
 * Simple batch interface:
 * - getAll(): download all orders from cloud
 * - saveAll(): upload orders to cloud (upsert)
 * - deleteAll(): delete orders from cloud
 */
export class ApiRepository {
  private readonly baseUrl: string;
  private accessToken: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  private get headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  async getAll(): Promise<Order[]> {
    const response = await fetch(`${this.baseUrl}/orders`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch orders: ${response.statusText}`);
    }

    return response.json();
  }

  async saveAll(orders: Order[]): Promise<void> {
    // Server POST /orders handles upsert
    await Promise.all(
      orders.map((order) =>
        fetch(`${this.baseUrl}/orders`, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(order),
        })
      )
    );
  }

  async deleteAll(ids: string[]): Promise<void> {
    await Promise.all(
      ids.map((id) =>
        fetch(`${this.baseUrl}/orders/${id}`, {
          method: 'DELETE',
          headers: this.headers,
        })
      )
    );
  }

  // Single-item operations for sync queue
  async save(order: Order): Promise<void> {
    const response = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(order),
    });
    if (!response.ok) {
      throw new Error(`Failed to save order: ${response.statusText}`);
    }
  }

  async update(id: string, data: Partial<Order>): Promise<void> {
    const response = await fetch(`${this.baseUrl}/orders/${id}`, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to update order: ${response.statusText}`);
    }
  }

  async delete(id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/orders/${id}`, {
      method: 'DELETE',
      headers: this.headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to delete order: ${response.statusText}`);
    }
  }
}

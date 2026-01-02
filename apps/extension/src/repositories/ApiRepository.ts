import type { Order } from '@/types/Order';

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
    const headers = this.buildHeaders({
      'Content-Type': 'application/json',
    });

    const response = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify(order),
      credentials: 'include',  // Send cookies cross-origin
    });

    if (!response.ok) {
      throw new Error(`Failed to save order: ${response.statusText}`);
    }
  }

  async getAll(): Promise<Order[]> {
    const headers = this.buildHeaders();
    const response = await fetch(`${this.baseUrl}/orders`, {
      headers,
      credentials: 'include',  // Send cookies cross-origin
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch orders: ${response.statusText}`);
    }

    return response.json();
  }

  async update(id: string, updates: Partial<Order>): Promise<void> {
    const headers = this.buildHeaders({
      'Content-Type': 'application/json',
    });

    const response = await fetch(`${this.baseUrl}/orders/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
      credentials: 'include',  // Send cookies cross-origin
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
      credentials: 'include',  // Send cookies cross-origin
    });

    if (!response.ok) {
      throw new Error(`Failed to delete order: ${response.statusText}`);
    }
  }

  async getById(id: string): Promise<Order | null> {
    const headers = this.buildHeaders();
    const response = await fetch(`${this.baseUrl}/orders/${id}`, {
      headers,
      credentials: 'include',  // Send cookies cross-origin
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

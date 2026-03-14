import ky, { type KyInstance } from 'ky';
import { z } from 'zod';
import type { Order } from '@/types';
import { OrderStatus } from '@/types';

const ApiOrderSchema = z.object({
  id: z.string(),
  userId: z.string(),
  orderNumber: z.string(),
  productName: z.string(),
  orderDate: z.string(),
  productImage: z.string(),
  price: z.string(),
  status: z.enum(OrderStatus),
  note: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  deletedAt: z.string().nullish().transform((v) => v ?? undefined),
});

const ApiOrdersResponseSchema = z.array(ApiOrderSchema);

export class ApiRepository {
  private api: KyInstance;
  private accessToken: string | null = null;

  constructor(baseUrl: string) {
    this.api = ky.create({
      prefixUrl: baseUrl,
      timeout: 30_000,
      retry: 0,
      hooks: {
        beforeRequest: [
          (request) => {
            if (this.accessToken) {
              request.headers.set('Authorization', `Bearer ${this.accessToken}`);
            }
          },
        ],
      },
    });
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  async getAll(): Promise<Order[]> {
    const data = await this.api.get('orders').json();
    return ApiOrdersResponseSchema.parse(data);
  }

  async save(order: Order): Promise<void> {
    await this.api.post('orders', { json: order });
  }

  async update(id: string, data: Partial<Order>): Promise<void> {
    await this.api.patch(`orders/${id}`, { json: data });
  }

  async delete(id: string): Promise<void> {
    await this.api.delete(`orders/${id}`);
  }

  async saveBatch(orders: Order[]): Promise<void> {
    if (orders.length === 0) return;
    await this.api.post('orders/batch', { json: { orders } });
  }

  async deleteBatchRemote(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.api.post('orders/batch-delete', { json: { ids } });
  }
}

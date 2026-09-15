import ky, { type KyInstance } from 'ky';
import { z } from 'zod';
import { OrderSchema } from '@/schemas/order';
import type { Order } from '@/types';

const ApiOrderSchema = OrderSchema.extend({
  deletedAt: OrderSchema.shape.deletedAt.nullish().transform((value) => value ?? undefined),
});

const ApiOrdersResponseSchema = z.array(ApiOrderSchema);

export class ApiRepository {
  private api: KyInstance;
  private readonly baseUrl: string;

  constructor(baseUrl: string, accessToken?: string) {
    this.baseUrl = baseUrl;
    this.api = ky.create({
      prefixUrl: baseUrl,
      timeout: 30_000,
      retry: 0,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
  }

  withAccessToken(token: string): ApiRepository {
    return new ApiRepository(this.baseUrl, token);
  }

  async getAll(): Promise<Order[]> {
    const data = await this.api.get('orders').json();
    return ApiOrdersResponseSchema.parse(data);
  }

  async saveBatch(orders: Order[]): Promise<void> {
    if (orders.length === 0) {
      return;
    }
    const BATCH_SIZE = 100;
    for (let i = 0; i < orders.length; i += BATCH_SIZE) {
      const chunk = orders.slice(i, i + BATCH_SIZE);
      await this.api.post('orders/batch', { json: { orders: chunk } });
    }
  }
}

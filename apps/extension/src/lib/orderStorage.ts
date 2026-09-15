import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';
import { OrderSchema, OrderUpdatesSchema } from '@/schemas/order';
import type { Order } from '@/types';

export const QueueItemSchema = z.object({
  id: z.string().min(1),
  operation: z.object({ type: z.literal('upsert'), order: OrderSchema }),
  createdAt: z.iso.datetime({ offset: true }),
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

// These historical requests have no owner. Retain them, but never submit them under a session.
const LegacyDeleteQueueItemSchema = QueueItemSchema.extend({
  operation: z.object({
    type: z.literal('delete'),
    orderId: z.string().min(1),
    orderNumber: z.string().min(1),
  }),
  retryCount: z.number().int().nonnegative().optional(),
});
export const StoredQueueSchema = z.array(z.union([QueueItemSchema, LegacyDeleteQueueItemSchema]));
export type StoredQueueItem = z.infer<typeof StoredQueueSchema>[number];

export const OrderStorageCommandSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('save'),
      orders: z.array(OrderSchema),
      fromCloud: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('update'),
      ids: z.array(z.string().min(1)),
      updates: OrderUpdatesSchema,
      userId: z.string().min(1),
    })
    .strict(),
  z.object({ kind: z.literal('enqueue'), orders: z.array(OrderSchema) }).strict(),
  z.object({ kind: z.literal('acknowledge'), ids: z.array(z.string().min(1)) }).strict(),
  z.object({ kind: z.literal('claim-local'), userId: z.string().min(1) }).strict(),
]);
export type OrderStorageCommand = z.infer<typeof OrderStorageCommandSchema>;

const OrderStorageResultSchema = z.object({ orders: z.array(OrderSchema) });
const OrderStorageResponseSchema = z.union([
  z.object({ error: z.string() }),
  OrderStorageResultSchema,
]);
export type OrderStorageResult = z.infer<typeof OrderStorageResultSchema>;

export async function mutateOrderStorage(
  command: OrderStorageCommand,
): Promise<OrderStorageResult> {
  const response: unknown = await chrome.runtime.sendMessage({ type: 'ORDER_STORAGE', command });
  const result = OrderStorageResponseSchema.parse(response);
  if ('error' in result) {
    throw new Error(result.error);
  }
  return result;
}

export function orderKey(order: Order): string {
  return JSON.stringify([order.userId, order.orderNumber]);
}

export function orderTime(order: Order): bigint {
  const timestamp = order.updatedAt ?? order.createdAt;
  return timestamp ? Temporal.Instant.from(timestamp).epochNanoseconds : 0n;
}

/** Advance the persisted version even if the device clock has moved backwards. */
export function nextOrderVersion(order?: Order): string {
  const now = Temporal.Instant.fromEpochMilliseconds(Date.now());
  const previous = order ? orderTime(order) : 0n;
  return (
    previous >= now.epochNanoseconds
      ? Temporal.Instant.fromEpochNanoseconds(previous).add({ nanoseconds: 1 })
      : now
  ).toString();
}

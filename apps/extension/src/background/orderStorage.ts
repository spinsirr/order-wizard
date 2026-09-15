import {
  nextOrderVersion,
  type OrderStorageCommand,
  OrderStorageCommandSchema,
  type OrderStorageResult,
  orderKey,
  orderTime,
  type StoredQueueItem,
  StoredQueueSchema,
} from '@/lib/orderStorage';
import { OrderSchema } from '@/schemas/order';
import type { Order } from '@/types';

interface StorageTransaction {
  orders: Map<string, Order>;
  pending: Map<string, StoredQueueItem>;
  changed: Order[];
}

function enqueue(tx: StorageTransaction, snapshot: Order): void {
  // A cloud pull may enqueue an old snapshot after a newer edit has already committed.
  const current = tx.orders.get(orderKey(snapshot));
  const order = current && orderTime(current) >= orderTime(snapshot) ? current : snapshot;
  if (order.userId === 'local') {
    return;
  }
  for (const [id, item] of tx.pending) {
    if (item.operation.type === 'upsert' && orderKey(item.operation.order) === orderKey(order)) {
      if (orderTime(item.operation.order) > orderTime(order)) {
        return;
      }
      tx.pending.delete(id);
    }
  }
  const id = crypto.randomUUID();
  tx.pending.set(id, {
    id,
    operation: { type: 'upsert', order },
    createdAt: new Date().toISOString(),
  });
}

function save(
  tx: StorageTransaction,
  command: Extract<OrderStorageCommand, { kind: 'save' }>,
): void {
  for (const incoming of command.orders) {
    const key = orderKey(incoming);
    const previous = tx.orders.get(key);
    if (command.fromCloud) {
      if (previous && orderTime(previous) > orderTime(incoming)) {
        continue;
      }
      tx.orders.set(key, incoming);
      tx.changed.push(incoming);
      continue;
    }
    // Capturing an already saved order must not overwrite edits made in another tab.
    if (previous && !previous.deletedAt) {
      tx.changed.push(previous);
      continue;
    }
    const saved = previous
      ? {
          ...previous,
          ...incoming,
          id: previous.id,
          createdAt: previous.createdAt,
          deletedAt: undefined,
          updatedAt: nextOrderVersion(previous),
        }
      : incoming;
    tx.orders.set(key, saved);
    tx.changed.push(saved);
    enqueue(tx, saved);
  }
}

function update(
  tx: StorageTransaction,
  command: Extract<OrderStorageCommand, { kind: 'update' }>,
): void {
  for (const [key, order] of tx.orders) {
    if (!command.ids.includes(order.id) || order.userId !== command.userId || order.deletedAt) {
      continue;
    }
    // Ownership and identity are immutable in ordinary edits.
    const updated = {
      ...order,
      status: command.updates.status ?? order.status,
      note: command.updates.note ?? order.note,
    };
    updated.updatedAt = nextOrderVersion(order);
    if (command.updates.deletedAt) {
      updated.deletedAt = updated.updatedAt;
    }
    tx.orders.set(key, updated);
    tx.changed.push(updated);
    enqueue(tx, updated);
  }
}

function claimLocal(tx: StorageTransaction, userId: string): void {
  for (const [key, order] of tx.orders) {
    if (order.userId !== 'local') {
      continue;
    }
    const claimed = { ...order, userId };
    // Keep an anonymous duplicate if an account record already exists.
    if (tx.orders.has(orderKey(claimed))) {
      continue;
    }
    tx.orders.delete(key);
    tx.orders.set(orderKey(claimed), claimed);
    enqueue(tx, claimed);
    tx.changed.push(claimed);
  }
}

/** All writers share a background transaction that commits orders and outbox together. */
export async function executeOrderStorageCommand(input: unknown): Promise<OrderStorageResult> {
  const command = OrderStorageCommandSchema.parse(input);
  return navigator.locks.request('ordercue-order-storage', async () => {
    const stored = await chrome.storage.local.get(['orders', 'sync_queue']);
    const tx: StorageTransaction = {
      orders: new Map(
        OrderSchema.array()
          .parse(stored['orders'] ?? [])
          .map((order) => [orderKey(order), order]),
      ),
      // Legacy unowned delete requests are retained but never uploaded. Sync recovers deletions
      // from the owned local tombstones; an unowned request cannot safely select an account.
      pending: new Map(
        StoredQueueSchema.parse(stored['sync_queue'] ?? []).map((item) => [item.id, item]),
      ),
      changed: [],
    };
    switch (command.kind) {
      case 'save':
        save(tx, command);
        break;
      case 'update':
        update(tx, command);
        break;
      case 'enqueue':
        for (const order of command.orders) {
          enqueue(tx, order);
        }
        break;
      case 'acknowledge':
        for (const id of command.ids) {
          tx.pending.delete(id);
        }
        break;
      case 'claim-local':
        claimLocal(tx, command.userId);
        break;
    }
    await chrome.storage.local.set({
      orders: [...tx.orders.values()],
      sync_queue: [...tx.pending.values()],
    });
    return { orders: tx.changed };
  });
}

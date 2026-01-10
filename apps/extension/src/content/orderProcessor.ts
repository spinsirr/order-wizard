import { v4 as uuidv4 } from 'uuid';
import { scrapeOrderData } from './scraper';
import { getCurrentUser } from './userResolver';
import type { Order } from '@/types';
import { OrderStatus } from '@/types';
import { orderRepository } from '@/config';

const orderDuplicateCache = new Map<string, Set<string>>();

function setOrderCache(userId: string, orders: readonly Order[]): void {
  orderDuplicateCache.set(userId, new Set(orders.map((order) => order.orderNumber)));
}

export async function ensureOrderCache(userId: string): Promise<void> {
  if (orderDuplicateCache.has(userId)) {
    return;
  }

  if ('setCurrentUserId' in orderRepository) {
    (orderRepository as { setCurrentUserId: (id: string) => void }).setCurrentUserId(userId);
  }
  const orders = await orderRepository.getAll();
  setOrderCache(userId, orders);
}

export function hasOrderInCache(userId: string, orderNumber: string): boolean {
  const cache = orderDuplicateCache.get(userId);
  return cache?.has(orderNumber) ?? false;
}

export function addOrderToCache(userId: string, orderNumber: string): void {
  const cache = orderDuplicateCache.get(userId);
  if (cache) {
    cache.add(orderNumber);
  } else {
    orderDuplicateCache.set(userId, new Set([orderNumber]));
  }
}

export async function replaceCacheFromMessage(message: unknown): Promise<void> {
  if (
    typeof message !== 'object' ||
    message === null ||
    (message as { type?: unknown }).type !== 'ORDERS_UPDATED'
  ) {
    return;
  }

  const orders = (message as { orders?: unknown }).orders;
  if (!Array.isArray(orders)) {
    return;
  }

  const currentUser = await getCurrentUser();
  const userOrders = (orders as Order[]).filter((order) => order.userId === currentUser.id);
  setOrderCache(currentUser.id, userOrders);
}

export interface SaveOrderResult {
  success: boolean;
  isDuplicate: boolean;
  order?: Order;
  error?: string;
}

export async function saveOrder(orderCard: Element, userId: string): Promise<SaveOrderResult> {
  await ensureOrderCache(userId);

  const scrapedData = scrapeOrderData(orderCard);

  if (hasOrderInCache(userId, scrapedData.orderNumber)) {
    return { success: false, isDuplicate: true };
  }

  const order: Order = {
    id: uuidv4(),
    userId,
    ...scrapedData,
    status: OrderStatus.Uncommented,
  };

  await orderRepository.save(order);
  addOrderToCache(userId, order.orderNumber);

  // Notify popup if open (ignore errors if popup is closed)
  chrome.runtime.sendMessage({
    type: 'ORDER_SAVED',
    order,
  }).catch(() => {
    // Popup not open, ignore
  });

  return { success: true, isDuplicate: false, order };
}

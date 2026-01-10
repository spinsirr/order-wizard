import { v4 as uuidv4 } from 'uuid';
import { scrapeOrderData } from './scraper';
import type { Order } from '@/types';
import { OrderStatus } from '@/types';
import { orderRepository } from '@/config';

export interface SaveOrderResult {
  success: boolean;
  isDuplicate: boolean;
  order?: Order;
  error?: string;
}

export async function saveOrder(orderCard: Element, userId: string): Promise<SaveOrderResult> {
  if ('setCurrentUserId' in orderRepository) {
    (orderRepository as { setCurrentUserId: (id: string) => void }).setCurrentUserId(userId);
  }

  const scrapedData = scrapeOrderData(orderCard);
  const allOrders = await orderRepository.getAll();

  // Check if order already exists (non-deleted)
  const existingOrder = allOrders.find(
    (o) => o.orderNumber === scrapedData.orderNumber && !o.deletedAt
  );

  if (existingOrder) {
    return { success: false, isDuplicate: true };
  }

  // Check if there's a soft-deleted order with the same orderNumber
  const deletedOrder = allOrders.find(
    (o) => o.orderNumber === scrapedData.orderNumber && o.deletedAt
  );

  let order: Order;

  if (deletedOrder) {
    // Restore the deleted order with updated data
    order = {
      ...deletedOrder,
      ...scrapedData,
      deletedAt: undefined,
      updatedAt: new Date().toISOString(),
    };
  } else {
    // Create new order
    const now = new Date().toISOString();
    order = {
      id: uuidv4(),
      userId,
      ...scrapedData,
      status: OrderStatus.Uncommented,
      createdAt: now,
      updatedAt: now,
    };
  }

  await orderRepository.save(order);

  // Notify popup if open (ignore errors if popup is closed)
  chrome.runtime.sendMessage({
    type: 'ORDER_SAVED',
    order,
  }).catch(() => {
    // Popup not open, ignore
  });

  return { success: true, isDuplicate: false, order };
}

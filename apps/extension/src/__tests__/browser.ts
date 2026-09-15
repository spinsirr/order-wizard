import { fakeBrowser } from '@webext-core/fake-browser';
import { vi } from 'vitest';
import { executeOrderStorageCommand } from '@/background/orderStorage';
import type { OrderStorageCommand } from '@/lib/orderStorage';
import type { AuthUser, Order } from '@/types';

export function installBrowser() {
  fakeBrowser.reset();
  vi.stubGlobal('chrome', fakeBrowser);
  fakeBrowser.runtime.onMessage.addListener(
    (message: { type: string; command: OrderStorageCommand }) =>
      message.type === 'ORDER_STORAGE' ? executeOrderStorageCommand(message.command) : undefined,
  );
  return fakeBrowser;
}

export function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: 'account-a',
    orderNumber: '111-0000000-0000000',
    productName: 'Headphones',
    orderDate: '2026-09-01',
    productImage: 'https://example.com/product.jpg',
    price: '$20',
    status: 'uncommented',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeSession(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    sub: 'account-a',
    access_token: 'access-a',
    id_token: 'id-a',
    refresh_token: 'refresh-a',
    expires_at: Date.now() + 3600_000,
    ...overrides,
  };
}

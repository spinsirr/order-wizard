import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkReturnReminders,
  initializeReturnReminders,
  RETURN_REMINDER_ALARM,
  RETURN_REMINDER_NOTIFICATION,
  RETURN_REMINDER_STATE_KEY,
} from '@/background/returnReminders';
import { type Order, OrderStatus } from '@/types';

function order(id = 'order-1', overrides: Partial<Order> = {}): Order {
  return {
    id,
    userId: 'user',
    orderNumber: id,
    productName: 'Private product',
    price: '$20',
    productImage: '',
    orderDate: '2026-08-01',
    status: OrderStatus.Commented,
    ...overrides,
  };
}

let storage: Record<string, unknown>;
const api = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: structuredClone(storage[key]) })),
      set: vi.fn(async (values: Record<string, unknown>) => {
        Object.assign(storage, structuredClone(values));
      }),
    },
    onChanged: { addListener: vi.fn() },
  },
  action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn(), setTitle: vi.fn() },
  notifications: {
    create:
      vi.fn<
        (id: string, options: chrome.notifications.NotificationCreateOptions) => Promise<string>
      >(),
    clear: vi.fn(),
    getPermissionLevel: vi.fn(),
    onClicked: { addListener: vi.fn() },
    onPermissionLevelChanged: { addListener: vi.fn() },
  },
  runtime: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
    onStartup: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
  },
  alarms: { get: vi.fn(), create: vi.fn(), onAlarm: { addListener: vi.fn() } },
  tabs: { create: vi.fn(async () => undefined) },
};

beforeEach(() => {
  vi.clearAllMocks();
  storage = { orders: [order()], last_order_user: 'user' };
  api.notifications.getPermissionLevel.mockResolvedValue('granted');
  api.notifications.create.mockResolvedValue(RETURN_REMINDER_NOTIFICATION);
  api.alarms.get.mockResolvedValue(undefined);
  vi.stubGlobal('chrome', api);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('background return reminders', () => {
  it('notifies once per stage across repeated checks and ignores note edits', async () => {
    for (const age of [25, 25, 26, 27, 28, 28, 29, 30, 31, 40]) {
      storage['orders'] = [order('order-1', { note: `Edited at age ${age}` })];
      await checkReturnReminders(new Date(2026, 7, 1 + age));
    }
    expect(api.notifications.create).toHaveBeenCalledTimes(3);
    expect(storage[RETURN_REMINDER_STATE_KEY]).toEqual({ 'order-1': '2026-08-31:overdue' });
  });

  it('groups orders in one notification without leaking order details', async () => {
    storage['orders'] = [
      order('private-id-1'),
      order('private-id-2'),
      order('paid', { status: OrderStatus.Reimbursed }),
    ];
    await checkReturnReminders(new Date(2026, 8, 1));
    expect(api.notifications.create).toHaveBeenCalledTimes(1);
    const notification = api.notifications.create.mock.calls[0]?.[1];
    expect(JSON.stringify(notification)).not.toMatch(/Private product|private-id|\$20/);
  });

  it.each(['reimbursed', 'deleted', 'removed'])(
    'clears notification and delivery state after an order is %s',
    async (resolution) => {
      await checkReturnReminders(new Date(2026, 7, 26));
      storage['orders'] =
        resolution === 'removed'
          ? []
          : [
              order(
                'order-1',
                resolution === 'reimbursed'
                  ? { status: OrderStatus.Reimbursed }
                  : { deletedAt: '2026-08-27T00:00:00Z' },
              ),
            ];
      await checkReturnReminders(new Date(2026, 7, 27));
      expect(api.notifications.clear).toHaveBeenCalledWith(RETURN_REMINDER_NOTIFICATION);
      expect(storage[RETURN_REMINDER_STATE_KEY]).toEqual({});
      expect(api.notifications.create).toHaveBeenCalledTimes(1);
    },
  );

  it('clears a stale grouped notification when one order is resolved', async () => {
    storage['orders'] = [order('one'), order('two')];
    await checkReturnReminders(new Date(2026, 7, 26));
    storage['orders'] = [order('one'), order('two', { status: OrderStatus.Reimbursed })];
    await checkReturnReminders(new Date(2026, 7, 26));
    expect(api.notifications.clear).toHaveBeenCalledWith(RETURN_REMINDER_NOTIFICATION);
    expect(api.notifications.create).toHaveBeenCalledTimes(1);
  });

  it('preserves pending delivery when alerts are disabled and delivers once permission returns', async () => {
    api.notifications.getPermissionLevel.mockResolvedValue('denied');
    await checkReturnReminders(new Date(2026, 7, 29));
    expect(api.notifications.create).not.toHaveBeenCalled();
    expect(storage[RETURN_REMINDER_STATE_KEY]).toBeUndefined();
    api.notifications.getPermissionLevel.mockResolvedValue('granted');
    await checkReturnReminders(new Date(2026, 7, 29));
    expect(api.notifications.create).toHaveBeenCalledTimes(1);
  });

  it('retries a failed notification without recording it as delivered', async () => {
    api.notifications.create.mockRejectedValueOnce(new Error('Delivery failed'));
    await expect(checkReturnReminders(new Date(2026, 7, 26))).rejects.toThrow('Delivery failed');
    expect(storage[RETURN_REMINDER_STATE_KEY]).toBeUndefined();
    await checkReturnReminders(new Date(2026, 7, 26));
    expect(storage[RETURN_REMINDER_STATE_KEY]).toEqual({ 'order-1': '2026-08-31:warning' });
  });

  it('rearms when reimbursement is reversed or the order date is corrected', async () => {
    const now = new Date(2026, 7, 29);
    await checkReturnReminders(now);
    storage['orders'] = [order('order-1', { status: OrderStatus.Reimbursed })];
    await checkReturnReminders(now);
    storage['orders'] = [order()];
    await checkReturnReminders(now);
    storage['orders'] = [order('order-1', { orderDate: '2026-08-04' })];
    await checkReturnReminders(now);
    expect(api.notifications.create).toHaveBeenCalledTimes(3);
  });

  it('installs an hourly alarm and serializes concurrent lifecycle/storage events', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 29));
    initializeReturnReminders();
    const onStartup = api.runtime.onStartup.addListener.mock.calls[0]?.[0];
    const onChanged = api.storage.onChanged.addListener.mock.calls[0]?.[0];
    onChanged({ orders: {} }, 'local');
    await onStartup();
    await vi.waitFor(() => expect(storage[RETURN_REMINDER_STATE_KEY]).toBeDefined());
    expect(api.alarms.create).toHaveBeenCalledWith(RETURN_REMINDER_ALARM, { periodInMinutes: 60 });
    expect(api.notifications.create).toHaveBeenCalledTimes(1);
    const calls = api.storage.local.get.mock.calls.length;
    onChanged({ [RETURN_REMINDER_STATE_KEY]: {} }, 'local');
    expect(api.storage.local.get.mock.calls.length).toBe(calls);
  });

  it('keeps an existing alarm and opens the return queue when its notification is clicked', async () => {
    storage['orders'] = [];
    api.alarms.get.mockResolvedValue({ name: RETURN_REMINDER_ALARM });
    initializeReturnReminders();
    await vi.waitFor(() =>
      expect(api.notifications.clear).toHaveBeenCalledWith(RETURN_REMINDER_NOTIFICATION),
    );
    expect(api.alarms.create).not.toHaveBeenCalled();
    const onClicked = api.notifications.onClicked.addListener.mock.calls[0]?.[0];
    onClicked('unrelated');
    expect(api.tabs.create).not.toHaveBeenCalled();
    onClicked(RETURN_REMINDER_NOTIFICATION);
    expect(api.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://test/sidepanel.html?view=returns',
    });
  });
});

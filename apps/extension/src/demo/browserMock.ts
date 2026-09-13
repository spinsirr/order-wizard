import { OrderStatus, type Order } from '@/types';

const DEMO_RUNTIME_ID = 'ordercue-demo';
const DEMO_STORAGE_KEY = 'ordercue-demo-storage';

const DEMO_ORDERS: Order[] = [
  {
    id: '3f6a85a7-c738-4bf8-af66-fb52f637a7a1',
    userId: 'demo-user',
    orderNumber: '114-9283417-6253801',
    productName: 'Rechargeable under-cabinet lights, warm white · 2 pack',
    orderDate: 'Aug 24, 2026',
    productImage: '',
    price: '$34.98',
    status: OrderStatus.Uncommented,
    note: 'Photograph the magnetic mounts',
    createdAt: '2026-08-24T17:28:00.000Z',
    updatedAt: '2026-08-24T17:28:00.000Z',
  },
  {
    id: 'cfc8349e-a98f-4ef6-bc02-dc5b48a71021',
    userId: 'demo-user',
    orderNumber: '113-4172508-9102663',
    productName: 'Compact espresso scale with timer and silicone mat',
    orderDate: 'Aug 21, 2026',
    productImage: '',
    price: '$27.50',
    status: OrderStatus.Commented,
    note: 'Follow up Friday',
    createdAt: '2026-08-21T15:10:00.000Z',
    updatedAt: '2026-08-25T09:12:00.000Z',
  },
  {
    id: 'dc0ca15d-8f1b-44cf-87d7-6f6b5f4e98e9',
    userId: 'demo-user',
    orderNumber: '112-7003981-1146270',
    productName: 'Foldable bamboo laptop stand with six height positions',
    orderDate: 'Aug 18, 2026',
    productImage: '',
    price: '$39.99',
    status: OrderStatus.CommentRevealed,
    note: 'Box is clean enough for resale',
    createdAt: '2026-08-18T20:45:00.000Z',
    updatedAt: '2026-08-23T18:02:00.000Z',
  },
  {
    id: '90856845-2841-41cf-a75a-f4c8997dce0b',
    userId: 'demo-user',
    orderNumber: '111-5639824-7651992',
    productName: 'Travel cable organizer, water-resistant canvas',
    orderDate: 'Aug 12, 2026',
    productImage: '',
    price: '$18.75',
    status: OrderStatus.Reimbursed,
    note: 'Ready to list on Marketplace',
    createdAt: '2026-08-12T12:05:00.000Z',
    updatedAt: '2026-08-20T21:16:00.000Z',
  },
];

type DemoStorage = Record<string, unknown>;

function readStorage(): DemoStorage {
  const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
  if (!raw) return {};

  try {
    return JSON.parse(raw) as DemoStorage;
  } catch {
    return {};
  }
}

function writeStorage(value: DemoStorage): void {
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(value));
}

function pickStorageValues(
  storage: DemoStorage,
  keys?: string | string[] | Record<string, unknown> | null,
): DemoStorage {
  if (keys == null) return { ...storage };
  if (typeof keys === 'string') return { [keys]: storage[keys] };
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, storage[key]]));
  }

  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [key, storage[key] ?? fallback]),
  );
}

export function isDemoMode(): boolean {
  return typeof chrome !== 'undefined' && chrome.runtime?.id === DEMO_RUNTIME_ID;
}

export async function resetDemoOrders(): Promise<void> {
  await chrome.storage.local.set({ orders: DEMO_ORDERS });
}

export function installDemoBrowserApi(): void {
  const existingChrome = globalThis.chrome;
  if (existingChrome?.storage?.local && existingChrome.runtime?.onMessage) return;

  const initialStorage = readStorage();
  if (!Array.isArray(initialStorage.orders)) {
    initialStorage.orders = DEMO_ORDERS;
    writeStorage(initialStorage);
  }

  const storageLocal = {
    get: async (keys?: string | string[] | Record<string, unknown> | null) =>
      pickStorageValues(readStorage(), keys),
    set: async (items: Record<string, unknown>) => {
      writeStorage({ ...readStorage(), ...items });
    },
    remove: async (keys: string | string[]) => {
      const next = readStorage();
      for (const key of Array.isArray(keys) ? keys : [keys]) delete next[key];
      writeStorage(next);
    },
    clear: async () => writeStorage({}),
  };

  const messageListeners = new Set<(...args: unknown[]) => unknown>();
  const demoChrome = {
    ...existingChrome,
    identity: {
      getRedirectURL: () => `${window.location.origin}/demo-auth-callback`,
      launchWebAuthFlow: (_details: unknown, callback?: (responseUrl?: string) => void) => {
        callback?.();
      },
    },
    runtime: {
      id: DEMO_RUNTIME_ID,
      lastError: undefined,
      onMessage: {
        addListener: (listener: (...args: unknown[]) => unknown) => {
          messageListeners.add(listener);
        },
        removeListener: (listener: (...args: unknown[]) => unknown) => {
          messageListeners.delete(listener);
        },
        hasListener: (listener: (...args: unknown[]) => unknown) => messageListeners.has(listener),
      },
    },
    storage: { local: storageLocal },
  };

  if (existingChrome) {
    Object.assign(existingChrome, demoChrome);
  } else {
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: demoChrome,
    });
  }
}

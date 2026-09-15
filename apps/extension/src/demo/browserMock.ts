import { fakeBrowser } from '@webext-core/fake-browser';
import { z } from 'zod';
import { executeOrderStorageCommand } from '@/background/orderStorage';
import { mockOrderList } from '@/demo/fixtures';
import type { ExtensionMessage } from '@/types/messages';

const DEMO_STORAGE_KEY = 'ordercue-demo-storage';
const sampleOrders = () => mockOrderList().map((order) => ({ ...order, userId: 'demo-user' }));

function readStorage(): Record<string, unknown> {
  try {
    return z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(window.localStorage.getItem(DEMO_STORAGE_KEY) ?? '{}'));
  } catch {
    return {};
  }
}

export async function resetDemoOrders(): Promise<void> {
  await chrome.storage.local.set({ orders: sampleOrders(), sync_queue: [] });
}

export async function installDemoBrowserApi(): Promise<void> {
  const existingChrome = globalThis.chrome;
  if (existingChrome?.storage?.local && existingChrome.runtime?.onMessage) {
    return;
  }

  fakeBrowser.reset();
  await fakeBrowser.storage.local.set({
    orders: sampleOrders(),
    sync_queue: [],
    last_order_user: 'demo-user',
    ...readStorage(),
  });
  fakeBrowser.storage.local.onChanged.addListener(() => {
    void fakeBrowser.storage.local.get().then((data: Record<string, unknown>) => {
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
    });
  });
  fakeBrowser.runtime.onMessage.addListener((message: ExtensionMessage) =>
    message.type === 'ORDER_STORAGE' ? executeOrderStorageCommand(message.command) : undefined,
  );

  const demoChrome = {
    storage: fakeBrowser.storage,
    runtime: { ...fakeBrowser.runtime, id: 'ordercue-demo' },
    identity: {
      getRedirectURL: () => `${window.location.origin}/demo-auth-callback`,
      launchWebAuthFlow: (_details: unknown, callback?: (responseUrl?: string) => void) => {
        callback?.();
      },
    },
  };
  if (existingChrome) {
    Object.assign(existingChrome, demoChrome);
  } else {
    Object.defineProperty(globalThis, 'chrome', { configurable: true, value: demoChrome });
  }
}

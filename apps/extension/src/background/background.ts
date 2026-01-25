import { fbQueue, initializeErrorHandlers } from '@/lib';
import type { Order } from '@/types';

initializeErrorHandlers();

console.log('🚀 Amazon Order Wizard background service worker loaded');

/**
 * Handle all runtime messages
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) return false;

  console.log('📨 Message received:', message);

  switch (message.type) {
    case 'ORDER_SAVED':
      console.log('📦 New order saved:', message.payload as Order);
      chrome.runtime
        .sendMessage({
          type: 'ORDER_SAVED_BROADCAST',
          order: message.payload,
        })
        .catch(() => {
          // Side panel not open, ignore
        });
      break;

    case 'PING':
      sendResponse({ status: 'OK' });
      break;

    case 'FB_QUEUE_PROCESS':
      processNextFBItem();
      break;

    case 'FB_FORM_READY':
      // Form filler is ready to receive data
      handleFBFormReady(sender.tab?.id);
      break;

    case 'FB_LISTING_COMPLETE':
      // Listing was published
      handleFBListingComplete(message.itemId);
      break;

    case 'FB_LISTING_FAILED':
      handleFBListingFailed(message.itemId, message.error);
      break;
  }

  return false;
});

/**
 * Listen for storage changes and broadcast to popup
 */
chrome.storage.local.onChanged.addListener((changes) => {
  if (changes.orders) {
    console.log('💾 Orders storage updated');
    // Send message to side panel if open (ignore errors if not open)
    chrome.runtime
      .sendMessage({
        type: 'ORDERS_UPDATED',
        orders: changes.orders.newValue || [],
      })
      .catch(() => {
        // Side panel not open, ignore
      });
  }
});

// Listen for extension installation
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('📦 Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    console.log('👋 Welcome to Amazon Order Wizard!');
  }

  // Enable side panel to open on action click
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    console.log('✅ Side panel behavior configured');
  } else {
    console.error('❌ Side panel API not available');
  }
});

// Add action click listener as fallback
chrome.action.onClicked.addListener(async (tab) => {
  console.log('🖱️ Extension icon clicked');
  if (chrome.sidePanel?.open) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    console.log('✅ Side panel opened');
  } else {
    console.error('❌ Side panel API not available, opening popup window');
    chrome.windows.create({
      url: chrome.runtime.getURL('index.html'),
      type: 'popup',
      width: 800,
      height: 600,
    });
  }
});

async function processNextFBItem(): Promise<void> {
  const next = await fbQueue.getNext();
  if (!next) {
    console.log('[FBQueue] No items to process');
    return;
  }

  console.log('[FBQueue] Processing item:', next.id);
  await fbQueue.updateStatus(next.id, 'filling');

  // Store current item ID for the form filler
  await chrome.storage.local.set({ fb_current_item: next.id });

  // Open FB Marketplace create page
  const tab = await chrome.tabs.create({
    url: 'https://www.facebook.com/marketplace/create/item',
    active: true,
  });

  console.log('[FBQueue] Opened FB tab:', tab.id);
}

async function handleFBFormReady(tabId?: number): Promise<void> {
  if (!tabId) return;

  const current = await fbQueue.getCurrentFilling();
  if (!current) {
    console.log('[FBQueue] No item currently filling');
    return;
  }

  // Send listing data to the form filler
  chrome.tabs.sendMessage(tabId, {
    type: 'FB_FILL_FORM',
    listing: current.listing,
    itemId: current.id,
  });
}

async function handleFBListingComplete(itemId: string): Promise<void> {
  await fbQueue.updateStatus(itemId, 'done');
  await chrome.storage.local.remove('fb_current_item');

  // Broadcast update
  chrome.runtime.sendMessage({ type: 'FB_QUEUE_UPDATED' }).catch(() => {});

  // Process next item after delay
  setTimeout(() => processNextFBItem(), 2000);
}

async function handleFBListingFailed(itemId: string, error: string): Promise<void> {
  await fbQueue.updateStatus(itemId, 'failed', error);
  await chrome.storage.local.remove('fb_current_item');

  // Broadcast update
  chrome.runtime.sendMessage({ type: 'FB_QUEUE_UPDATED' }).catch(() => {});
}

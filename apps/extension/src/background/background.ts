import { initializeErrorHandlers } from '@/lib';
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

    case 'FETCH_URL':
      // Fetch URL from background to avoid CORS issues
      handleFetchUrl(message.url)
        .then(sendResponse)
        .catch((error) => sendResponse({ error: error.message }));
      return true; // Keep channel open for async response

    case 'OPEN_FB_MARKETPLACE':
      // Open FB Marketplace create page - form filler will read listing from storage
      chrome.tabs.create({
        url: 'https://www.facebook.com/marketplace/create/item',
        active: true,
      });
      break;
  }

  return false;
});

async function handleFetchUrl(url: string): Promise<{ html?: string; error?: string }> {
  try {
    const response = await fetch(url, {
      credentials: 'include',
    });
    if (!response.ok) {
      return { error: `Failed to fetch: ${response.status}` };
    }
    const html = await response.text();
    return { html };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

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


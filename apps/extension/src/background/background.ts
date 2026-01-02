import { initializeErrorHandlers } from '@/utils/errorHandler';
import type { Order } from '@/types/Order';

initializeErrorHandlers();

console.log('🚀 Amazon Order Wizard background service worker loaded');

/**
 * Handle all runtime messages
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('📨 Message received:', message);

  switch (message.type) {
    case 'ORDER_SAVED':
      console.log('📦 New order saved:', message.payload as Order);
      chrome.runtime.sendMessage({
        type: 'ORDER_SAVED_BROADCAST',
        order: message.payload,
      });
      break;

    case 'PING':
      sendResponse({ status: 'OK' });
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
    chrome.runtime.sendMessage({
      type: 'ORDERS_UPDATED',
      orders: changes.orders.newValue || [],
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
  try {
    if (chrome.sidePanel?.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      console.log('✅ Side panel behavior configured');
    } else {
      console.error('❌ Side panel API not available');
    }
  } catch (error) {
    console.error('❌ Failed to configure side panel:', error);
  }
});

// Add action click listener as fallback
chrome.action.onClicked.addListener(async (tab) => {
  console.log('🖱️ Extension icon clicked');
  try {
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
  } catch (error) {
    console.error('❌ Error opening side panel:', error);
    chrome.windows.create({
      url: chrome.runtime.getURL('index.html'),
      type: 'popup',
      width: 800,
      height: 600,
    });
  }
});

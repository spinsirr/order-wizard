import { initializeErrorHandlers } from '@/lib';
import { fillFBForm } from './formFiller';
import type { FBListingData } from '@/types';

initializeErrorHandlers();

console.log('[FB FormFiller] Content script loaded on FB Marketplace');

// Notify background that we're ready
chrome.runtime.sendMessage({ type: 'FB_FORM_READY' });

// Listen for fill commands
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === 'FB_FILL_FORM') {
    const listing = message.listing as FBListingData;
    const itemId = message.itemId as string;

    fillFBForm(listing)
      .then(() => {
        console.log('[FB FormFiller] Fill complete, waiting for user to publish');
        // Update status to waiting
        chrome.runtime.sendMessage({
          type: 'FB_LISTING_WAITING',
          itemId,
        });
      })
      .catch((error) => {
        console.error('[FB FormFiller] Fill failed:', error);
        chrome.runtime.sendMessage({
          type: 'FB_LISTING_FAILED',
          itemId,
          error: error.message,
        });
      });
  }
  return false;
});

// Watch for successful listing (URL changes to listing page)
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // Check if we're on a listing page (not create page)
    if (location.href.includes('/marketplace/item/')) {
      chrome.storage.local.get('fb_current_item').then(({ fb_current_item }) => {
        if (fb_current_item) {
          chrome.runtime.sendMessage({
            type: 'FB_LISTING_COMPLETE',
            itemId: fb_current_item,
          });
        }
      });
    }
  }
});

urlObserver.observe(document.body, { childList: true, subtree: true });

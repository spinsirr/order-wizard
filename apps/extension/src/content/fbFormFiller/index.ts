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

// Listing completion is detected by fbListingComplete content script
// which runs when FB navigates to /marketplace/item/*

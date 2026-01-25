/**
 * Content script that runs on FB Marketplace listing pages.
 * Detects when a listing was just created and notifies the background script.
 */

console.log('[FB ListingComplete] Content script loaded on listing page');

// Check if we have a pending item that was just published
chrome.storage.local.get('fb_current_item').then(({ fb_current_item }) => {
  if (fb_current_item) {
    console.log('[FB ListingComplete] Found pending item:', fb_current_item);

    // Notify background that listing is complete
    chrome.runtime.sendMessage({
      type: 'FB_LISTING_COMPLETE',
      itemId: fb_current_item,
    });
  }
});

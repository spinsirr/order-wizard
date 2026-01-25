import { initializeErrorHandlers } from '@/lib';
import { fillFBForm } from './formFiller';
import type { FBListingData } from '@/types';

const FB_PENDING_LISTING_KEY = 'fb_pending_listing';

initializeErrorHandlers();

console.log('[FB FormFiller] Content script loaded on FB Marketplace');

// Read listing from storage and fill the form
async function init(): Promise<void> {
  const result = await chrome.storage.local.get(FB_PENDING_LISTING_KEY);
  const listing = result[FB_PENDING_LISTING_KEY] as FBListingData | undefined;

  if (!listing) {
    console.log('[FB FormFiller] No pending listing found in storage');
    return;
  }

  console.log('[FB FormFiller] Found pending listing:', listing.title);

  // Clear the pending listing from storage
  await chrome.storage.local.remove(FB_PENDING_LISTING_KEY);

  // Fill the form
  try {
    await fillFBForm(listing);
    console.log('[FB FormFiller] Form filled successfully');
  } catch (error) {
    console.error('[FB FormFiller] Failed to fill form:', error);
  }
}

init();

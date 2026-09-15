import { FB_PENDING_LISTING_KEY } from '@/constants';
import { FBListingDataSchema } from '@/schemas/fbListing';
import type { FBListingData } from '@/types';

export type ListingDraftCommand = { kind: 'save' | 'clear'; listing: FBListingData };

export async function executeListingDraftCommand(command: ListingDraftCommand): Promise<void> {
  const listing = FBListingDataSchema.parse(command.listing);
  await navigator.locks.request('ordercue-listing-draft', async () => {
    if (command.kind === 'save') {
      await chrome.storage.local.set({ [FB_PENDING_LISTING_KEY]: listing });
    } else {
      const stored = await chrome.storage.local.get(FB_PENDING_LISTING_KEY);
      // A newer draft prepared in another Amazon tab belongs to that tab's workflow.
      if (JSON.stringify(stored[FB_PENDING_LISTING_KEY]) === JSON.stringify(listing)) {
        await chrome.storage.local.remove(FB_PENDING_LISTING_KEY);
      }
    }
  });
}

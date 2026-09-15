import type { ListingDraftCommand } from '@/background/listingDraft';

export async function changeListingDraft(command: ListingDraftCommand): Promise<void> {
  const result = await chrome.runtime.sendMessage({ type: 'LISTING_DRAFT', command });
  if (!result?.ok) {
    throw new Error(result?.error ?? 'Could not save Marketplace draft');
  }
}

import { FB_PENDING_LISTING_KEY } from '@/constants';
import { type FillField, fillFBForm } from '@/content/fbFormFiller/formFiller';
import { showFillResultDialog } from '@/content/fbMarketplace/previewModal';
import { initializeErrorHandlers } from '@/lib';
import { changeListingDraft } from '@/lib/listingDraft';
import { FBListingDataSchema } from '@/schemas/fbListing';

export default defineContentScript({
  matches: ['*://*.facebook.com/marketplace/create/*'],
  async main(ctx) {
    initializeErrorHandlers();
    const stored = await chrome.storage.local.get(FB_PENDING_LISTING_KEY);
    if (!stored[FB_PENDING_LISTING_KEY]) {
      return;
    }
    const listing = FBListingDataSchema.parse(stored[FB_PENDING_LISTING_KEY]);
    const attempt = async (fields?: FillField[]) => {
      const results = await fillFBForm(listing, fields);
      showFillResultDialog(ctx, results, (action) => {
        if (action === 'retry') {
          void attempt(results.filter((result) => result.error).map((result) => result.field));
        }
        if (action === 'done') {
          void changeListingDraft({ kind: 'clear', listing });
        }
      });
    };
    await attempt();
  },
});

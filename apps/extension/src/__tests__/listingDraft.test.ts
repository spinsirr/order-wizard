import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { executeListingDraftCommand } from '@/background/listingDraft';
import { FB_PENDING_LISTING_KEY } from '@/constants';
import type { FBListingData } from '@/types';
import { installBrowser } from './browser';

beforeEach(installBrowser);
afterEach(() => vi.unstubAllGlobals());

it('keeps a newer draft when an older Marketplace tab finishes', async () => {
  const listing: FBListingData = {
    title: 'Headphones',
    price: '20',
    originalPrice: '40',
    description: 'With box',
    condition: 'new',
    category: 'electronics',
    pickupLocation: '',
    images: ['https://example.com/product.jpg'],
    orderNumber: 'first',
    orderDate: '2026-09-01',
  };
  const newer = { ...listing, orderNumber: 'second' };
  await executeListingDraftCommand({ kind: 'save', listing });
  await executeListingDraftCommand({ kind: 'save', listing: newer });
  await executeListingDraftCommand({ kind: 'clear', listing });
  expect((await chrome.storage.local.get(FB_PENDING_LISTING_KEY))[FB_PENDING_LISTING_KEY]).toEqual(
    newer,
  );
  await executeListingDraftCommand({ kind: 'clear', listing: newer });
  expect(
    (await chrome.storage.local.get(FB_PENDING_LISTING_KEY))[FB_PENDING_LISTING_KEY],
  ).toBeUndefined();
});

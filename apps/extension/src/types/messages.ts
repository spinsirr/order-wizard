import type { ListingDraftCommand } from '@/background/listingDraft';
import type { OrderStorageCommand, OrderStorageResult } from '@/lib/orderStorage';
import type { Order } from './index';

/**
 * Typed message protocol for extension internal messaging.
 * All messages between content scripts, background, and sidepanel
 * must use one of these types.
 */

export type ExtensionMessage =
  | { type: 'LISTING_DRAFT'; command: ListingDraftCommand }
  | { type: 'ORDER_STORAGE'; command: OrderStorageCommand }
  | { type: 'PING' }
  | { type: 'ORDER_SAVED'; order: Order }
  | { type: 'FETCH_URL'; url: string }
  | { type: 'OPEN_FB_MARKETPLACE' };

interface ExtensionResponses {
  PING: { status: string };
  FETCH_URL: { html: string } | { error: string };
  ORDER_STORAGE: OrderStorageResult | { error: string };
  LISTING_DRAFT: { ok: true } | { error: string };
  OPEN_FB_MARKETPLACE: { ok: true } | { error: string };
  ORDER_SAVED: undefined;
}
export type ExtensionResponse<T extends ExtensionMessage['type']> = ExtensionResponses[T];

import type { Order } from './index';

/**
 * Typed message protocol for extension internal messaging.
 * All messages between content scripts, background, and sidepanel
 * must use one of these types.
 */

export type ExtensionMessage =
  | { type: 'PING' }
  | { type: 'ORDER_SAVED'; order: Order }
  | { type: 'FETCH_URL'; url: string }
  | { type: 'OPEN_FB_MARKETPLACE' };

export type ExtensionResponse<T extends ExtensionMessage['type']> =
  T extends 'PING' ? { status: string }
  : T extends 'FETCH_URL' ? { html?: string; error?: string }
  : void;

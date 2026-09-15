import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createIframeUi } from 'wxt/utils/content-script-ui/iframe';
import type { FillResult } from '@/content/fbFormFiller/formFiller';
import { FBListingDataSchema } from '@/schemas/fbListing';
import type { FBListingData } from '@/types';

let activePreview: { remove: () => void } | undefined;

export function showPreviewModal(
  ctx: ContentScriptContext,
  listing: FBListingData,
  trigger: HTMLButtonElement,
  onConfirm: (listing: FBListingData) => void,
  onCancel: () => void,
): void {
  FBListingDataSchema.parse(listing);
  showListingUi(ctx, { type: 'ordercue:preview', listing }, trigger, (data) => {
    if (data?.type === 'cancel') {
      onCancel();
    } else if (data?.type === 'confirm') {
      onConfirm(FBListingDataSchema.parse(data.listing));
    }
  });
}

export function showFillResultDialog(
  ctx: ContentScriptContext,
  results: FillResult[],
  onAction: (action: 'retry' | 'keep' | 'done') => void,
): void {
  showListingUi(ctx, { type: 'ordercue:fill-result', results }, document.body, (data) => {
    if (data?.type === 'retry' || data?.type === 'keep' || data?.type === 'done') {
      onAction(data.type);
    }
  });
}

function showListingUi(
  ctx: ContentScriptContext,
  request: object,
  trigger: HTMLElement,
  onMessage: (data: { type?: string; listing?: unknown }) => void,
): void {
  activePreview?.remove();
  const channel = new MessageChannel();
  const ui = createIframeUi(ctx, {
    page: '/listing-preview.html',
    position: 'modal',
    zIndex: 2147483647,
    onBeforeMount: (_, iframe) => {
      iframe.title = 'OrderCue listing preview';
      Object.assign(iframe.style, {
        width: '100vw',
        height: '100dvh',
        border: '0',
        colorScheme: 'normal',
      });
      iframe.addEventListener(
        'load',
        () => {
          // A private port keeps listing data and responses off the host page's message bus.
          iframe.contentWindow?.postMessage(
            request,
            new URL('/', iframe.src).href.replace(/\/$/, ''),
            [channel.port2],
          );
          iframe.focus();
        },
        { once: true },
      );
    },
    onRemove: () => {
      channel.port1.close();
      channel.port2.close();
      if (activePreview === ui) {
        activePreview = undefined;
      }
      if (trigger.isConnected) {
        trigger.focus();
      }
    },
  });
  channel.port1.onmessage = ({ data }) => {
    if (!data || typeof data !== 'object') {
      return;
    }
    if (!['cancel', 'confirm', 'retry', 'keep', 'done'].includes(data.type)) {
      return;
    }
    ui.remove();
    onMessage(data);
  };
  activePreview = ui;
  ui.mount();
}

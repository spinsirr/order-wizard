import { initFBMarketplace } from '@/content/fbMarketplace';
import {
  injectSaveButtons,
  setupMutationObserver,
  showDuplicateFeedback,
  showErrorFeedback,
  showRefreshFeedback,
  showSuccessFeedback,
} from '@/content/injector';
import { saveOrder } from '@/content/orderProcessor';
import { getCurrentUser } from '@/content/userResolver';
import { initializeErrorHandlers } from '@/lib';

export default defineContentScript({
  matches: [
    '*://*.amazon.com/gp/your-account/order-history*',
    '*://*.amazon.com/your-orders/orders*',
  ],
  runAt: 'document_idle',
  main(ctx) {
    initializeErrorHandlers();

    async function handleSaveClick(orderCard: Element, button: HTMLButtonElement): Promise<void> {
      try {
        const currentUser = await getCurrentUser();
        const result = await saveOrder(orderCard, currentUser.id);

        if (result.isDuplicate) {
          showDuplicateFeedback(button);
          return;
        }

        if (result.success) {
          showSuccessFeedback(button);
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Extension context invalidated')) {
          showRefreshFeedback(button);
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to save order';
        showErrorFeedback(button, message);
      }
    }

    console.info('OrderCue content script loaded');

    injectSaveButtons(handleSaveClick);
    setupMutationObserver(handleSaveClick);

    initFBMarketplace(ctx);
  },
});

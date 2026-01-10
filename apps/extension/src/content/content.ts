import { initializeErrorHandlers } from '@/lib';
import { getCurrentUser } from './userResolver';
import { saveOrder, replaceCacheFromMessage } from './orderProcessor';
import {
  injectSaveButtons,
  setupMutationObserver,
  showSuccessFeedback,
  showDuplicateFeedback,
  showErrorFeedback,
  showRefreshFeedback,
} from './injector';

initializeErrorHandlers();

chrome.runtime.onMessage.addListener((message) => {
  void replaceCacheFromMessage(message);
});

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

function init(): void {
  console.log('🚀 Amazon Order Wizard content script loaded');

  injectSaveButtons(handleSaveClick);
  setupMutationObserver(handleSaveClick);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

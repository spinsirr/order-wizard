import { initializeErrorHandlers } from '@/lib';
import type { ExtensionMessage } from '@/types/messages';

export default defineBackground(() => {
  initializeErrorHandlers();

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;

    switch (message.type) {
      case 'PING':
        sendResponse({ status: 'OK' });
        break;

      case 'FETCH_URL':
        handleFetchUrl(message.url)
          .then(sendResponse)
          .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' }));
        return true;

      case 'OPEN_FB_MARKETPLACE':
        chrome.tabs.create({
          url: 'https://www.facebook.com/marketplace/create/item',
          active: true,
        });
        break;
    }

    return false;
  });

  const ALLOWED_FETCH_ORIGINS = ['https://www.amazon.com', 'https://www.amazon.co.uk', 'https://www.amazon.ca', 'https://www.amazon.de', 'https://www.amazon.co.jp'];

  async function handleFetchUrl(url: string): Promise<{ html?: string; error?: string }> {
    try {
      const parsed = new URL(url);
      if (!ALLOWED_FETCH_ORIGINS.includes(parsed.origin)) {
        return { error: `Blocked: ${parsed.origin} is not an allowed origin` };
      }
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        return { error: `Failed to fetch: ${response.status}` };
      }
      const html = await response.text();
      return { html };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  chrome.runtime.onInstalled.addListener(async () => {
    if (chrome.sidePanel?.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  });

  chrome.action.onClicked.addListener(async (tab) => {
    if (chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } else {
      chrome.windows.create({
        url: chrome.runtime.getURL('sidepanel.html'),
        type: 'popup',
        width: 800,
        height: 600,
      });
    }
  });
});

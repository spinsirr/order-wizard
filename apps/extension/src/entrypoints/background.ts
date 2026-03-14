import { initializeErrorHandlers } from '@/lib';

export default defineBackground(() => {
  initializeErrorHandlers();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;

    switch (message.type) {
      case 'PING':
        sendResponse({ status: 'OK' });
        break;

      case 'FETCH_URL':
        handleFetchUrl(message.url)
          .then(sendResponse)
          .catch((error) => sendResponse({ error: error.message }));
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

  async function handleFetchUrl(url: string): Promise<{ html?: string; error?: string }> {
    try {
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

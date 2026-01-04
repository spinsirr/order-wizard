import { v4 as uuidv4 } from 'uuid';
import { scrapeOrderData } from './scraper';
import type { Order } from '@/types';
import { OrderStatus } from '@/types';
import { orderRepository } from '@/config';
import { initializeErrorHandlers } from '@/utils';

const orderDuplicateCache = new Map<string, Set<string>>();
const CURRENT_USER_STORAGE_KEY = 'currentUser';

interface StoredUser {
  id: string;
  email?: string;
  name?: string;
}

let cachedUser: StoredUser | null = null;

async function readCurrentUserFromStorage(): Promise<StoredUser | null> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get([CURRENT_USER_STORAGE_KEY], (result) => {
        if (chrome.runtime?.lastError) {
          console.error(
            'Failed to read current user from chrome.storage:',
            chrome.runtime.lastError,
          );
          resolve(null);
          return;
        }
        resolve((result[CURRENT_USER_STORAGE_KEY] as StoredUser | undefined) ?? null);
      });
    });
  }

  const raw = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as StoredUser) : null;
}

async function getCurrentUser(): Promise<StoredUser | null> {
  if (cachedUser) {
    return cachedUser;
  }

  cachedUser = await readCurrentUserFromStorage();
  return cachedUser;
}

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    if (CURRENT_USER_STORAGE_KEY in changes) {
      const change = changes[CURRENT_USER_STORAGE_KEY];
      cachedUser = (change?.newValue as StoredUser | undefined) ?? null;
    }
  });
}

void getCurrentUser();

function setOrderCache(userId: string, orders: readonly Order[]): void {
  orderDuplicateCache.set(userId, new Set(orders.map((order) => order.orderNumber)));
}

async function ensureOrderCache(userId: string): Promise<void> {
  if (orderDuplicateCache.has(userId)) {
    return;
  }

  // Set the current userId on the repository (for LocalStorage repositories)
  if ('setCurrentUserId' in orderRepository) {
    (orderRepository as { setCurrentUserId: (id: string) => void }).setCurrentUserId(userId);
  }
  const orders = await orderRepository.getAll();
  setOrderCache(userId, orders);
}

function hasOrderInCache(userId: string, orderNumber: string): boolean {
  const cache = orderDuplicateCache.get(userId);
  return cache?.has(orderNumber) ?? false;
}

function addOrderToCache(userId: string, orderNumber: string): void {
  const cache = orderDuplicateCache.get(userId);
  if (cache) {
    cache.add(orderNumber);
  } else {
    orderDuplicateCache.set(userId, new Set([orderNumber]));
  }
}

async function replaceCacheFromMessage(message: unknown): Promise<void> {
  if (
    typeof message !== 'object' ||
    message === null ||
    (message as { type?: unknown }).type !== 'ORDERS_UPDATED'
  ) {
    return;
  }

  const orders = (message as { orders?: unknown }).orders;
  if (!Array.isArray(orders)) {
    return;
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return;
  }

  const userOrders = (orders as Order[]).filter((order) => order.userId === currentUser.id);
  setOrderCache(currentUser.id, userOrders);
}

// Initialize error handlers
initializeErrorHandlers();

chrome.runtime.onMessage.addListener((message) => {
  void replaceCacheFromMessage(message);
});

/**
 * Create and inject "Save Order" button
 */
function createSaveButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = '💾 Save Order';
  button.className = 'save-order-btn';
  button.style.cssText = `
    background: #FF9900;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    margin-left: 12px;
    transition: background 0.2s;
  `;

  button.addEventListener('mouseenter', () => {
    button.style.background = '#E88B00';
  });

  button.addEventListener('mouseleave', () => {
    button.style.background = '#FF9900';
  });

  return button;
}

/**
 * Generic function to show temporary feedback on button
 */
function showButtonFeedback(
  button: HTMLButtonElement,
  text: string,
  backgroundColor: string,
  disableButton: boolean = true,
): void {
  const originalText = button.textContent || '💾 Save Order';
  const originalBackground = button.style.background || '#FF9900';
  const originalDisabled = button.disabled;

  button.textContent = text;
  button.style.background = backgroundColor;
  button.disabled = disableButton;

  setTimeout(() => {
    button.textContent = originalText;
    button.style.background = originalBackground;
    button.disabled = originalDisabled;
  }, 2000);
}

/**
 * Show success feedback on button
 */
function showSuccessFeedback(button: HTMLButtonElement): void {
  showButtonFeedback(button, '✅ Saved!', '#067D62', true);
}

/**
 * Show duplicate feedback on button
 */
function showDuplicateFeedback(button: HTMLButtonElement): void {
  showButtonFeedback(button, 'ℹ️ Already saved', '#0060df', true);
}

/**
 * Handle save button click
 */
async function handleSaveClick(orderCard: Element, button: HTMLButtonElement): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error('Please sign in before saving orders.');
  }

  await ensureOrderCache(currentUser.id);

  // Scrape order data
  const scrapedData = scrapeOrderData(orderCard);

  // Check for duplicates by order number
  if (hasOrderInCache(currentUser.id, scrapedData.orderNumber)) {
    showDuplicateFeedback(button);
    return;
  }

  // Create order object
  const order: Order = {
    id: uuidv4(),
    userId: currentUser.id,
    ...scrapedData,
    status: OrderStatus.Uncommented,
  };

  // Save to repository
  await orderRepository.save(order);

  addOrderToCache(currentUser.id, order.orderNumber);

  // Show success feedback
  showSuccessFeedback(button);

  // Notify popup if open
  chrome.runtime.sendMessage({
    type: 'ORDER_SAVED',
    order,
  });
}

/**
 * Inject save buttons into order cards
 */
function injectSaveButtons(): void {
  const orderCards = document.querySelectorAll('.order-card.js-order-card');

  orderCards.forEach((orderCard) => {
    // Check if button already injected
    if (orderCard.querySelector('.save-order-btn')) {
      return;
    }

    // Find "Ship to" section
    const shipToSection = orderCard.querySelector('.a-column.a-span7.a-span-last');

    if (shipToSection) {
      const button = createSaveButton();

      button.addEventListener('click', () => {
        handleSaveClick(orderCard, button);
      });

      // Inject button
      shipToSection.appendChild(button);
    }
  });
}

/**
 * Initialize content script
 */
function init(): void {
  console.log('🚀 Amazon Order Wizard content script loaded');

  // Inject buttons on initial page load
  injectSaveButtons();

  // Re-inject on DOM changes (for infinite scroll or AJAX updates)
  const observer = new MutationObserver(() => {
    injectSaveButtons();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export type SaveHandler = (orderCard: Element, button: HTMLButtonElement) => Promise<void>;

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

export function showButtonFeedback(
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

export function showSuccessFeedback(button: HTMLButtonElement): void {
  showButtonFeedback(button, '✅ Saved!', '#067D62', true);
}

export function showDuplicateFeedback(button: HTMLButtonElement): void {
  showButtonFeedback(button, 'ℹ️ Already saved', '#0060df', true);
}

export function showErrorFeedback(button: HTMLButtonElement, message: string): void {
  showButtonFeedback(button, `❌ ${message}`, '#d32f2f', false);
}

export function showRefreshFeedback(button: HTMLButtonElement): void {
  showButtonFeedback(button, 'Refresh page', '#d32f2f', false);
}

export function injectSaveButtons(onSave: SaveHandler): void {
  const orderCards = document.querySelectorAll('.order-card.js-order-card');

  orderCards.forEach((orderCard) => {
    if (orderCard.querySelector('.save-order-btn')) {
      return;
    }

    const shipToSection = orderCard.querySelector('.a-column.a-span7.a-span-last');

    if (shipToSection) {
      const button = createSaveButton();

      button.addEventListener('click', async () => {
        await onSave(orderCard, button);
      });

      shipToSection.appendChild(button);
    }
  });
}

export function setupMutationObserver(onSave: SaveHandler): MutationObserver {
  let debounceTimer: ReturnType<typeof setTimeout>;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => injectSaveButtons(onSave), 200);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Retry injection for cards whose inner content hasn't rendered yet.
  // Amazon renders card shells before filling in child sections,
  // so the initial pass (and early mutations) can miss the inject target.
  let retries = 0;
  const maxRetries = 10;
  const retryInterval = setInterval(() => {
    retries++;
    const uninjected = document.querySelectorAll(
      '.order-card.js-order-card:not(:has(.save-order-btn))',
    );
    if (uninjected.length === 0 || retries >= maxRetries) {
      clearInterval(retryInterval);
      return;
    }
    injectSaveButtons(onSave);
  }, 500);

  return observer;
}

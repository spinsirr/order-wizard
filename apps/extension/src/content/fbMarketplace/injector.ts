export type ListHandler = (orderCard: Element, button: HTMLButtonElement) => Promise<void>;

function createFBButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = '📦 List on FB';
  button.className = 'list-fb-btn';
  button.style.cssText = `
    background: #1877F2;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    margin-left: 8px;
    transition: background 0.2s;
  `;

  button.addEventListener('mouseenter', () => {
    button.style.background = '#166FE5';
  });

  button.addEventListener('mouseleave', () => {
    button.style.background = '#1877F2';
  });

  return button;
}

export function showFBButtonLoading(button: HTMLButtonElement): void {
  button.textContent = '⏳ Loading...';
  button.disabled = true;
}

export function showFBButtonReady(button: HTMLButtonElement): void {
  button.textContent = '📦 List on FB';
  button.disabled = false;
}

export function showFBButtonError(button: HTMLButtonElement, message: string): void {
  const original = button.textContent;
  button.textContent = `❌ ${message}`;
  button.style.background = '#d32f2f';

  setTimeout(() => {
    button.textContent = original || '📦 List on FB';
    button.style.background = '#1877F2';
  }, 3000);
}

export function injectFBButtons(onList: ListHandler): void {
  const orderCards = document.querySelectorAll('.order-card.js-order-card');

  orderCards.forEach((orderCard) => {
    if (orderCard.querySelector('.list-fb-btn')) {
      return;
    }

    // Find the save button to place FB button next to it
    const saveButton = orderCard.querySelector('.save-order-btn');
    if (saveButton) {
      const button = createFBButton();
      button.addEventListener('click', async () => {
        await onList(orderCard, button);
      });
      saveButton.after(button);
    }
  });
}

export function setupFBMutationObserver(onList: ListHandler): MutationObserver {
  const observer = new MutationObserver(() => {
    injectFBButtons(onList);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return observer;
}

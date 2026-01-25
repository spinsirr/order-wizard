import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { FloatingQueue } from './FloatingQueue';

let queueRoot: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement | null = null;

export function showFloatingQueue(): void {
  if (container) return; // Already showing

  container = document.createElement('div');
  container.id = 'fb-listing-queue-widget';
  document.body.appendChild(container);

  queueRoot = createRoot(container);
  queueRoot.render(createElement(FloatingQueue));
}

export function hideFloatingQueue(): void {
  if (queueRoot) {
    queueRoot.unmount();
    queueRoot = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
}

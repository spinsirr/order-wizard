import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { PreviewModal } from './PreviewModal';
import type { FBListingData } from '@/types';

let modalRoot: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement | null = null;

export function showPreviewModal(
  listing: FBListingData,
  onConfirm: (listing: FBListingData) => void,
  onCancel: () => void
): void {
  // Clean up existing modal
  hidePreviewModal();

  // Create container
  container = document.createElement('div');
  container.id = 'fb-listing-preview-modal';
  document.body.appendChild(container);

  // Create React root and render
  modalRoot = createRoot(container);
  modalRoot.render(
    createElement(PreviewModal, {
      listing,
      onConfirm: (result) => {
        hidePreviewModal();
        onConfirm(result);
      },
      onCancel: () => {
        hidePreviewModal();
        onCancel();
      },
    })
  );
}

export function hidePreviewModal(): void {
  if (modalRoot) {
    modalRoot.unmount();
    modalRoot = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
}

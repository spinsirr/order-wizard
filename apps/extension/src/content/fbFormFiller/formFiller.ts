import type { FBListingData } from '@/types';

function dispatchInputEvent(element: HTMLInputElement | HTMLTextAreaElement): void {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value')?.set;
  if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    element.value = value;
  }
  dispatchInputEvent(element);
}

/**
 * Find an input/textarea by its associated label text.
 * Facebook uses <label><div><span>Label</span><input/></div></label> structure.
 */
function findInputByLabelText(labelText: string): HTMLInputElement | HTMLTextAreaElement | null {
  // Find all spans and look for one with matching text
  const spans = document.querySelectorAll('span');
  for (const span of spans) {
    if (span.textContent?.trim() === labelText) {
      // Found the label span, now find the associated input
      const label = span.closest('label');
      if (label) {
        const input = label.querySelector('input, textarea');
        if (input) {
          return input as HTMLInputElement | HTMLTextAreaElement;
        }
      }
      // Also try finding input as sibling within same parent div
      const parent = span.parentElement;
      if (parent) {
        const input = parent.querySelector('input, textarea');
        if (input) {
          return input as HTMLInputElement | HTMLTextAreaElement;
        }
      }
    }
  }
  return null;
}

async function waitForInputByLabel(labelText: string, timeout = 10000): Promise<HTMLInputElement | HTMLTextAreaElement> {
  return new Promise((resolve, reject) => {
    const input = findInputByLabelText(labelText);
    if (input) {
      resolve(input);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = findInputByLabelText(labelText);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for input with label "${labelText}"`));
    }, timeout);
  });
}

async function uploadImages(images: string[]): Promise<void> {
  // Find the file input or drop zone
  const fileInput = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
  if (!fileInput) {
    console.warn('[FB FormFiller] No file input found');
    return;
  }

  // Download images and create File objects
  const files: File[] = [];
  for (let i = 0; i < images.length; i++) {
    try {
      const response = await fetch(images[i]);
      const blob = await response.blob();
      const file = new File([blob], `image-${i}.jpg`, { type: 'image/jpeg' });
      files.push(file);
    } catch (e) {
      console.warn('[FB FormFiller] Failed to download image:', images[i], e);
    }
  }

  if (files.length === 0) return;

  // Create a DataTransfer to set files
  const dt = new DataTransfer();
  for (const f of files) {
    dt.items.add(f);
  }
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function fillFBForm(listing: FBListingData): Promise<void> {
  console.log('[FB FormFiller] Filling form with:', listing);

  // Wait for page to load
  await new Promise(r => setTimeout(r, 2000));

  // Fill title
  try {
    const titleInput = await waitForInputByLabel('Title');
    setNativeValue(titleInput, listing.title);
    console.log('[FB FormFiller] Title filled');
  } catch (e) {
    console.warn('[FB FormFiller] Failed to fill title:', e);
  }

  await new Promise(r => setTimeout(r, 300));

  // Fill price
  try {
    const priceInput = await waitForInputByLabel('Price');
    setNativeValue(priceInput, listing.price);
    console.log('[FB FormFiller] Price filled');
  } catch (e) {
    console.warn('[FB FormFiller] Failed to fill price:', e);
  }

  await new Promise(r => setTimeout(r, 300));

  // Fill description
  try {
    const descInput = await waitForInputByLabel('Description');
    setNativeValue(descInput, listing.description);
    console.log('[FB FormFiller] Description filled');
  } catch (e) {
    console.warn('[FB FormFiller] Failed to fill description:', e);
  }

  // Upload images
  try {
    await uploadImages(listing.images);
    console.log('[FB FormFiller] Images uploaded');
  } catch (e) {
    console.warn('[FB FormFiller] Failed to upload images:', e);
  }

  console.log('[FB FormFiller] Form filling complete');
}

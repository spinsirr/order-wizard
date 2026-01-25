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

async function waitForElement(selector: string, timeout = 10000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
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

  // Wait for form to load
  await new Promise((r) => setTimeout(r, 2000));

  // Fill title
  try {
    const titleInput = (await waitForElement('[aria-label="Title"]')) as HTMLInputElement;
    setNativeValue(titleInput, listing.title);
    await new Promise((r) => setTimeout(r, 500));
  } catch (e) {
    console.warn('[FB FormFiller] Failed to fill title:', e);
  }

  // Fill price
  try {
    const priceInput = (await waitForElement('[aria-label="Price"]')) as HTMLInputElement;
    setNativeValue(priceInput, listing.price);
    await new Promise((r) => setTimeout(r, 500));
  } catch (e) {
    console.warn('[FB FormFiller] Failed to fill price:', e);
  }

  // Fill description
  try {
    const descInput = (await waitForElement('[aria-label="Description"]')) as HTMLTextAreaElement;
    setNativeValue(descInput, listing.description);
    await new Promise((r) => setTimeout(r, 500));
  } catch (e) {
    console.warn('[FB FormFiller] Failed to fill description:', e);
  }

  // Upload images
  try {
    await uploadImages(listing.images);
  } catch (e) {
    console.warn('[FB FormFiller] Failed to upload images:', e);
  }

  console.log('[FB FormFiller] Form filling complete');
}

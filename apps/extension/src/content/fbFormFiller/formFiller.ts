import { waitElement } from '@1natsu/wait-element';
import type { FBListingData } from '@/types';
import { FB_CATEGORY_LABELS, FB_CONDITION_LABELS } from '@/types';

export const FILL_FIELDS = [
  'Title',
  'Price',
  'Description',
  'Category',
  'Condition',
  'Location',
  'Images',
] as const;
export type FillField = (typeof FILL_FIELDS)[number];
export interface FillResult {
  field: FillField;
  error?: string | undefined;
}

async function waitFor<T extends Element>(find: () => T | null): Promise<T> {
  return waitElement<T>('body', {
    signal: AbortSignal.timeout(10_000),
    detector: () => {
      const element = find();
      return element ? { isDetected: true, result: element } : { isDetected: false };
    },
  });
}

function labelledContainer(labelText: string): Element | null {
  const span = [...document.querySelectorAll('span')].find(
    (span) => span.textContent?.trim() === labelText,
  );
  return span?.closest('label') ?? span?.parentElement ?? null;
}

async function fillText(label: string, value: string): Promise<void> {
  const element = await waitFor(
    () =>
      document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `input[aria-label="${label}"], textarea[aria-label="${label}"]`,
      ) ??
      labelledContainer(label)?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        'input, textarea',
      ) ??
      null,
  );
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) {
    throw new Error(`${label} does not accept text`);
  }
  setter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function selectOption(label: string, value: string): Promise<void> {
  const trigger = await waitFor(
    () =>
      document.querySelector<HTMLElement>(`[role="combobox"][aria-label="${label}"]`) ??
      labelledContainer(label)?.querySelector<HTMLElement>(
        '[role="combobox"], [aria-haspopup="listbox"]',
      ) ??
      null,
  );
  trigger.click();
  const option = await waitFor(
    () =>
      [...document.querySelectorAll<HTMLElement>('[role="option"], [role="menuitem"]')].find(
        (option) => option.textContent?.trim() === value,
      ) ?? null,
  );
  option.click();
}

async function uploadImages(images: string[]): Promise<void> {
  if (!images.length) {
    return;
  }
  const input = await waitFor(() =>
    document.querySelector<HTMLInputElement>('input[type="file"][accept*="image"]'),
  );
  const files = await Promise.all(
    images.map(async (url, index) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Image download failed (${response.status})`);
      }
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) {
        throw new Error('Image URL did not return an image');
      }
      return new File([blob], `image-${index}`, { type: blob.type });
    }),
  );
  const transfer = new DataTransfer();
  for (const file of files) {
    transfer.items.add(file);
  }
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Returns every failed field to the user; retries can target only those fields. */
export async function fillFBForm(
  listing: FBListingData,
  fields: readonly FillField[] = FILL_FIELDS,
): Promise<FillResult[]> {
  const actions: Record<FillField, () => Promise<void>> = {
    Title: () => fillText('Title', listing.title),
    Price: () => fillText('Price', listing.price),
    Description: () => fillText('Description', listing.description),
    Category: () => selectOption('Category', FB_CATEGORY_LABELS[listing.category]),
    Condition: () => selectOption('Condition', FB_CONDITION_LABELS[listing.condition]),
    Location: async () => {
      if (!listing.pickupLocation.trim()) {
        return;
      }
      await fillText('Location', listing.pickupLocation);
      const option = await waitFor(
        () =>
          [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
            (option) => option.textContent?.trim() === listing.pickupLocation.trim(),
          ) ?? null,
      );
      option.click();
    },
    Images: () => uploadImages(listing.images),
  };
  const results: FillResult[] = [];
  for (const field of fields) {
    try {
      await actions[field]();
      results.push({ field });
    } catch (error) {
      results.push({
        field,
        error: error instanceof Error ? error.message : 'Could not fill field',
      });
    }
  }
  return results;
}

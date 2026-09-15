// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { fillFBForm } from '@/content/fbFormFiller/formFiller';
import type { FBListingData } from '@/types';

const listing: FBListingData = {
  title: 'Headphones',
  price: '20',
  originalPrice: '40',
  description: 'With box',
  condition: 'new',
  category: 'electronics',
  pickupLocation: 'Downtown',
  images: [],
  orderNumber: 'first',
  orderDate: '2026-09-01',
};
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('fills only the requested text fields and dispatches input events', async () => {
  document.body.innerHTML =
    '<input aria-label="Title"><input aria-label="Price" value="Keep price">';
  const title = document.querySelector('input');
  const changed = vi.fn();
  title?.addEventListener('input', changed);
  expect(await fillFBForm(listing, ['Title'])).toEqual([{ field: 'Title' }]);
  expect(title?.value).toBe('Headphones');
  expect(changed).toHaveBeenCalledOnce();
  expect(document.querySelector<HTMLInputElement>('input[aria-label="Price"]')?.value).toBe(
    'Keep price',
  );
});

it('applies category, condition and the selected pickup location', async () => {
  document.body.innerHTML =
    '<button role="combobox" aria-label="Category"></button><button role="combobox" aria-label="Condition"></button><input aria-label="Location"><button role="option">Electronics</button><button role="option">New</button><button role="option">Downtown</button>';
  const clicked = vi.fn();
  document.querySelectorAll('[role="option"]').forEach((option) => {
    option.addEventListener('click', clicked);
  });
  expect(await fillFBForm(listing, ['Category', 'Condition', 'Location'])).toEqual([
    { field: 'Category' },
    { field: 'Condition' },
    { field: 'Location' },
  ]);
  expect(clicked).toHaveBeenCalledTimes(3);
});

it('reports an image failure while allowing another field to succeed', async () => {
  document.body.innerHTML = '<input type="file" accept="image/*"><input aria-label="Title">';
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }));
  expect(
    await fillFBForm({ ...listing, images: ['https://example.com/denied.jpg'] }, [
      'Images',
      'Title',
    ]),
  ).toEqual([{ field: 'Images', error: 'Image download failed (403)' }, { field: 'Title' }]);
});

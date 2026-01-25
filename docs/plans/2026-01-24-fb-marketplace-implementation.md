# FB Marketplace Listing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add one-click listing of Amazon orders to Facebook Marketplace with batch support and configurable templates.

**Architecture:** Browser extension with content scripts on both Amazon (button injection) and Facebook (form filling). Background script manages queue and cross-tab communication. Options page for template configuration.

**Tech Stack:** React 19, TypeScript, Vite, TailwindCSS 4, Chrome Extension APIs, Zod validation

---

## Task 1: Add Types and Schemas

**Files:**
- Create: `apps/extension/src/types/fbListing.ts`
- Modify: `apps/extension/src/types/index.ts`
- Create: `apps/extension/src/schemas/fbListing.ts`
- Modify: `apps/extension/src/schemas/index.ts`

**Step 1: Create FB listing types**

```typescript
// apps/extension/src/types/fbListing.ts

export const FBCondition = {
  New: 'new',
  UsedLikeNew: 'used_like_new',
  UsedGood: 'used_good',
  UsedFair: 'used_fair',
} as const;

export type FBCondition = (typeof FBCondition)[keyof typeof FBCondition];

export const FB_CONDITION_LABELS: Record<FBCondition, string> = {
  [FBCondition.New]: 'New',
  [FBCondition.UsedLikeNew]: 'Used - Like New',
  [FBCondition.UsedGood]: 'Used - Good',
  [FBCondition.UsedFair]: 'Used - Fair',
};

export const FBCategory = {
  General: 'general',
  Electronics: 'electronics',
  Clothing: 'clothing',
  HomeGarden: 'home_garden',
  ToysGames: 'toys_games',
  Sports: 'sports',
} as const;

export type FBCategory = (typeof FBCategory)[keyof typeof FBCategory];

export const FB_CATEGORY_LABELS: Record<FBCategory, string> = {
  [FBCategory.General]: 'General',
  [FBCategory.Electronics]: 'Electronics',
  [FBCategory.Clothing]: 'Clothing & Accessories',
  [FBCategory.HomeGarden]: 'Home & Garden',
  [FBCategory.ToysGames]: 'Toys & Games',
  [FBCategory.Sports]: 'Sports & Outdoors',
};

export const QueueItemStatus = {
  Pending: 'pending',
  Filling: 'filling',
  Waiting: 'waiting',
  Done: 'done',
  Failed: 'failed',
} as const;

export type QueueItemStatus = (typeof QueueItemStatus)[keyof typeof QueueItemStatus];

export interface FBListingTemplate {
  discountPercent: number;
  condition: FBCondition;
  category: FBCategory;
  pickupLocation: string;
  includeOrderLink: boolean;
  descriptionTemplate: string;
}

export interface FBListingData {
  title: string;
  description: string;
  price: string;
  originalPrice: string;
  condition: FBCondition;
  category: FBCategory;
  pickupLocation: string;
  images: string[];
  orderNumber: string;
  orderDate: string;
  productUrl?: string;
}

export interface FBQueueItem {
  id: string;
  listing: FBListingData;
  status: QueueItemStatus;
  error?: string;
  createdAt: string;
}

export interface ProductDetails {
  description: string;
  features: string[];
  images: string[];
  category?: string;
}

export const DEFAULT_TEMPLATE: FBListingTemplate = {
  discountPercent: 80,
  condition: FBCondition.New,
  category: FBCategory.General,
  pickupLocation: '',
  includeOrderLink: false,
  descriptionTemplate: `{productName}

{productDescription}

Condition: {condition}
Original price: \${originalPrice}
Purchased: {orderDate}

Pickup only. Message me if interested!`,
};
```

**Step 2: Export from types index**

Add to `apps/extension/src/types/index.ts`:

```typescript
export * from './fbListing';
```

**Step 3: Create Zod schemas**

```typescript
// apps/extension/src/schemas/fbListing.ts
import { z } from 'zod';
import { FBCondition, FBCategory } from '@/types';

export const FBListingTemplateSchema = z.object({
  discountPercent: z.number().min(0).max(100),
  condition: z.nativeEnum(FBCondition),
  category: z.nativeEnum(FBCategory),
  pickupLocation: z.string(),
  includeOrderLink: z.boolean(),
  descriptionTemplate: z.string().min(1),
});

export const FBListingDataSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  price: z.string(),
  originalPrice: z.string(),
  condition: z.nativeEnum(FBCondition),
  category: z.nativeEnum(FBCategory),
  pickupLocation: z.string(),
  images: z.array(z.string().url()),
  orderNumber: z.string(),
  orderDate: z.string(),
  productUrl: z.string().url().optional(),
});

export const ProductDetailsSchema = z.object({
  description: z.string(),
  features: z.array(z.string()),
  images: z.array(z.string().url()),
  category: z.string().optional(),
});
```

**Step 4: Export from schemas index**

Add to `apps/extension/src/schemas/index.ts`:

```typescript
export * from './fbListing';
```

**Step 5: Run typecheck**

```bash
cd apps/extension && bun run typecheck
```

**Step 6: Commit**

```bash
git add apps/extension/src/types/ apps/extension/src/schemas/
git commit -m "feat: add FB Marketplace types and schemas"
```

---

## Task 2: Create FB Queue Manager

**Files:**
- Create: `apps/extension/src/lib/fbQueue.ts`
- Modify: `apps/extension/src/lib/index.ts`

**Step 1: Create FB queue manager**

```typescript
// apps/extension/src/lib/fbQueue.ts
import type { FBQueueItem, FBListingData, QueueItemStatus } from '@/types';

const FB_QUEUE_KEY = 'fb_listing_queue';

type QueueListener = (queue: FBQueueItem[]) => void;

class FBQueue {
  private listeners: Set<QueueListener> = new Set();
  private cachedQueue: FBQueueItem[] = [];
  private hydrated = false;
  private paused = false;

  async getQueue(): Promise<FBQueueItem[]> {
    const result = await chrome.storage.local.get(FB_QUEUE_KEY);
    return (result[FB_QUEUE_KEY] as FBQueueItem[]) || [];
  }

  private async saveQueue(queue: FBQueueItem[]): Promise<void> {
    await chrome.storage.local.set({ [FB_QUEUE_KEY]: queue });
    this.cachedQueue = queue;
    this.notifyListeners();
  }

  async add(listing: FBListingData): Promise<string> {
    const queue = await this.getQueue();
    const id = crypto.randomUUID();

    queue.push({
      id,
      listing,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    await this.saveQueue(queue);
    return id;
  }

  async addBatch(listings: FBListingData[]): Promise<string[]> {
    const queue = await this.getQueue();
    const ids: string[] = [];

    for (const listing of listings) {
      const id = crypto.randomUUID();
      ids.push(id);
      queue.push({
        id,
        listing,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }

    await this.saveQueue(queue);
    return ids;
  }

  async updateStatus(id: string, status: QueueItemStatus, error?: string): Promise<void> {
    const queue = await this.getQueue();
    const index = queue.findIndex((item) => item.id === id);

    if (index !== -1) {
      queue[index] = { ...queue[index], status, error };
      await this.saveQueue(queue);
    }
  }

  async remove(id: string): Promise<void> {
    const queue = await this.getQueue();
    const filtered = queue.filter((item) => item.id !== id);
    await this.saveQueue(filtered);
  }

  async clear(): Promise<void> {
    await this.saveQueue([]);
  }

  async getNext(): Promise<FBQueueItem | null> {
    if (this.paused) return null;
    const queue = await this.getQueue();
    return queue.find((item) => item.status === 'pending') || null;
  }

  async getCurrentFilling(): Promise<FBQueueItem | null> {
    const queue = await this.getQueue();
    return queue.find((item) => item.status === 'filling') || null;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  isPaused(): boolean {
    return this.paused;
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    this.getQueue().then(listener);
    return () => this.listeners.delete(listener);
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.cachedQueue = await this.getQueue();
    this.hydrated = true;
  }

  getSnapshot(): FBQueueItem[] {
    return this.cachedQueue;
  }

  private notifyListeners(): void {
    for (const fn of this.listeners) {
      fn(this.cachedQueue);
    }
  }
}

export const fbQueue = new FBQueue();
```

**Step 2: Export from lib index**

Add to `apps/extension/src/lib/index.ts`:

```typescript
export { fbQueue } from './fbQueue';
```

**Step 3: Run typecheck**

```bash
cd apps/extension && bun run typecheck
```

**Step 4: Commit**

```bash
git add apps/extension/src/lib/
git commit -m "feat: add FB Marketplace queue manager"
```

---

## Task 3: Create Template Storage Utilities

**Files:**
- Create: `apps/extension/src/lib/fbTemplate.ts`
- Modify: `apps/extension/src/lib/index.ts`

**Step 1: Create template storage**

```typescript
// apps/extension/src/lib/fbTemplate.ts
import { DEFAULT_TEMPLATE, type FBListingTemplate, FB_CONDITION_LABELS } from '@/types';
import { FBListingTemplateSchema } from '@/schemas';

const TEMPLATE_KEY = 'fb_listing_template';

export async function getTemplate(): Promise<FBListingTemplate> {
  const result = await chrome.storage.local.get(TEMPLATE_KEY);
  const stored = result[TEMPLATE_KEY];

  if (!stored) return DEFAULT_TEMPLATE;

  const parsed = FBListingTemplateSchema.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_TEMPLATE;
}

export async function saveTemplate(template: FBListingTemplate): Promise<void> {
  const validated = FBListingTemplateSchema.parse(template);
  await chrome.storage.local.set({ [TEMPLATE_KEY]: validated });
}

export function applyTemplate(
  template: FBListingTemplate,
  data: {
    productName: string;
    productDescription: string;
    originalPrice: string;
    orderDate: string;
  }
): { description: string; price: string } {
  const priceNum = parseFloat(data.originalPrice.replace(/[^0-9.]/g, ''));
  const sellingPrice = (priceNum * (template.discountPercent / 100)).toFixed(2);

  const description = template.descriptionTemplate
    .replace(/{productName}/g, data.productName)
    .replace(/{productDescription}/g, data.productDescription)
    .replace(/{originalPrice}/g, data.originalPrice.replace(/[^0-9.]/g, ''))
    .replace(/{sellingPrice}/g, sellingPrice)
    .replace(/{orderDate}/g, data.orderDate)
    .replace(/{condition}/g, FB_CONDITION_LABELS[template.condition]);

  return { description, price: sellingPrice };
}
```

**Step 2: Export from lib index**

Add to `apps/extension/src/lib/index.ts`:

```typescript
export { getTemplate, saveTemplate, applyTemplate } from './fbTemplate';
```

**Step 3: Run typecheck**

```bash
cd apps/extension && bun run typecheck
```

**Step 4: Commit**

```bash
git add apps/extension/src/lib/
git commit -m "feat: add FB template storage utilities"
```

---

## Task 4: Create Amazon Product Scraper

**Files:**
- Create: `apps/extension/src/content/fbMarketplace/productScraper.ts`

**Step 1: Create product page scraper**

```typescript
// apps/extension/src/content/fbMarketplace/productScraper.ts
import type { ProductDetails } from '@/types';

export async function scrapeProductPage(productUrl: string): Promise<ProductDetails> {
  const response = await fetch(productUrl, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch product page: ${response.status}`);
  }

  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Extract description from "About this item" section
  const descriptionItems = doc.querySelectorAll('#feature-bullets li span');
  const features: string[] = [];
  descriptionItems.forEach((item) => {
    const text = item.textContent?.trim();
    if (text) features.push(text);
  });

  // Try alternate description location
  let description = features.join('\n');
  if (!description) {
    const productDesc = doc.querySelector('#productDescription p');
    description = productDesc?.textContent?.trim() || '';
  }

  // Extract high-res images
  const images: string[] = [];

  // Main image
  const mainImage = doc.querySelector('#landingImage') as HTMLImageElement;
  if (mainImage?.src) {
    // Get high-res version by modifying URL
    const highRes = mainImage.src.replace(/\._[A-Z]{2}\d+_\./, '.');
    images.push(highRes);
  }

  // Thumbnail images (for alternate views)
  const thumbnails = doc.querySelectorAll('#altImages img');
  thumbnails.forEach((thumb) => {
    const img = thumb as HTMLImageElement;
    if (img.src && !img.src.includes('play-button')) {
      const highRes = img.src.replace(/\._[A-Z]{2}\d+_\./, '.').replace(/\._[A-Z]+\d+,\d+_\./, '.');
      if (!images.includes(highRes)) {
        images.push(highRes);
      }
    }
  });

  // Try to detect category from breadcrumbs
  const breadcrumbs = doc.querySelectorAll('#wayfinding-breadcrumbs_feature_div li a');
  const category = breadcrumbs[0]?.textContent?.trim();

  return {
    description,
    features,
    images: images.slice(0, 5), // Limit to 5 images
    category,
  };
}
```

**Step 2: Run typecheck**

```bash
cd apps/extension && bun run typecheck
```

**Step 3: Commit**

```bash
git add apps/extension/src/content/fbMarketplace/
git commit -m "feat: add Amazon product page scraper"
```

---

## Task 5: Create "List on FB" Button Injector

**Files:**
- Create: `apps/extension/src/content/fbMarketplace/injector.ts`

**Step 1: Create FB button injector**

```typescript
// apps/extension/src/content/fbMarketplace/injector.ts
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
```

**Step 2: Run typecheck**

```bash
cd apps/extension && bun run typecheck
```

**Step 3: Commit**

```bash
git add apps/extension/src/content/fbMarketplace/
git commit -m "feat: add List on FB button injector"
```

---

## Task 6: Create Preview Modal Component

**Files:**
- Create: `apps/extension/src/content/fbMarketplace/PreviewModal.tsx`
- Create: `apps/extension/src/content/fbMarketplace/previewModal.ts`

**Step 1: Create React preview modal**

```typescript
// apps/extension/src/content/fbMarketplace/PreviewModal.tsx
import React, { useState } from 'react';
import type { FBListingData, FBCondition, FBCategory } from '@/types';
import { FB_CONDITION_LABELS, FB_CATEGORY_LABELS, FBCondition as Conditions, FBCategory as Categories } from '@/types';

interface PreviewModalProps {
  listing: FBListingData;
  onConfirm: (listing: FBListingData) => void;
  onCancel: () => void;
}

export function PreviewModal({ listing: initial, onConfirm, onCancel }: PreviewModalProps) {
  const [listing, setListing] = useState(initial);
  const [selectedImages, setSelectedImages] = useState<Set<number>>(
    new Set(initial.images.map((_, i) => i))
  );

  const handleImageToggle = (index: number) => {
    const next = new Set(selectedImages);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedImages(next);
  };

  const handleConfirm = () => {
    const finalListing = {
      ...listing,
      images: listing.images.filter((_, i) => selectedImages.has(i)),
    };
    onConfirm(finalListing);
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2 style={styles.title}>Preview FB Listing</h2>

        <div style={styles.field}>
          <label style={styles.label}>Title</label>
          <input
            style={styles.input}
            value={listing.title}
            onChange={(e) => setListing({ ...listing, title: e.target.value })}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Price ($)</label>
          <input
            style={styles.input}
            value={listing.price}
            onChange={(e) => setListing({ ...listing, price: e.target.value })}
          />
          <span style={styles.hint}>Original: ${listing.originalPrice}</span>
        </div>

        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>Condition</label>
            <select
              style={styles.select}
              value={listing.condition}
              onChange={(e) => setListing({ ...listing, condition: e.target.value as FBCondition })}
            >
              {Object.entries(FB_CONDITION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Category</label>
            <select
              style={styles.select}
              value={listing.category}
              onChange={(e) => setListing({ ...listing, category: e.target.value as FBCategory })}
            >
              {Object.entries(FB_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Description</label>
          <textarea
            style={styles.textarea}
            value={listing.description}
            onChange={(e) => setListing({ ...listing, description: e.target.value })}
            rows={6}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Images (click to toggle)</label>
          <div style={styles.imageGrid}>
            {listing.images.map((src, i) => (
              <div
                key={i}
                style={{
                  ...styles.imageWrapper,
                  opacity: selectedImages.has(i) ? 1 : 0.4,
                  border: selectedImages.has(i) ? '2px solid #1877F2' : '2px solid transparent',
                }}
                onClick={() => handleImageToggle(i)}
              >
                <img src={src} alt={`Product ${i + 1}`} style={styles.image} />
              </div>
            ))}
          </div>
        </div>

        <div style={styles.buttons}>
          <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button style={styles.confirmBtn} onClick={handleConfirm}>
            Confirm & List on FB
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999999,
  },
  modal: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '90vh',
    overflow: 'auto',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  title: {
    margin: '0 0 20px',
    fontSize: '20px',
    fontWeight: 600,
  },
  field: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '4px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#333',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  hint: {
    fontSize: '12px',
    color: '#666',
    marginTop: '4px',
  },
  row: {
    display: 'flex',
    gap: '16px',
  },
  imageGrid: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  imageWrapper: {
    width: '80px',
    height: '80px',
    borderRadius: '6px',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  buttons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '20px',
  },
  cancelBtn: {
    padding: '10px 20px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    background: 'white',
    cursor: 'pointer',
    fontSize: '14px',
  },
  confirmBtn: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '6px',
    background: '#1877F2',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
};
```

**Step 2: Create modal mount utility**

```typescript
// apps/extension/src/content/fbMarketplace/previewModal.ts
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
```

**Step 3: Run typecheck**

```bash
cd apps/extension && bun run typecheck
```

**Step 4: Commit**

```bash
git add apps/extension/src/content/fbMarketplace/
git commit -m "feat: add preview modal for FB listing"
```

---

## Task 7: Create FB Content Script Entry

**Files:**
- Create: `apps/extension/src/content/fbMarketplace/index.ts`
- Modify: `apps/extension/src/content/content.ts`

**Step 1: Create FB marketplace content entry**

```typescript
// apps/extension/src/content/fbMarketplace/index.ts
import { scrapeOrderData } from '../scraper';
import { scrapeProductPage } from './productScraper';
import { injectFBButtons, setupFBMutationObserver, showFBButtonLoading, showFBButtonReady, showFBButtonError } from './injector';
import { showPreviewModal } from './previewModal';
import { getTemplate, applyTemplate } from '@/lib';
import { fbQueue } from '@/lib';
import type { FBListingData } from '@/types';

async function handleListOnFB(orderCard: Element, button: HTMLButtonElement): Promise<void> {
  showFBButtonLoading(button);

  try {
    // Get basic order data
    const orderData = scrapeOrderData(orderCard);

    // Get product URL for detailed scraping
    const productLink = orderCard.querySelector('.yohtmlc-product-title a') as HTMLAnchorElement;
    const productUrl = productLink?.href;

    // Get template
    const template = await getTemplate();

    // Scrape product details if we have URL
    let productDetails = { description: '', features: [] as string[], images: [orderData.productImage] };
    if (productUrl) {
      try {
        productDetails = await scrapeProductPage(productUrl);
        if (productDetails.images.length === 0) {
          productDetails.images = [orderData.productImage];
        }
      } catch (e) {
        console.warn('Failed to scrape product page:', e);
        productDetails.images = [orderData.productImage];
      }
    }

    // Apply template
    const { description, price } = applyTemplate(template, {
      productName: orderData.productName,
      productDescription: productDetails.description || productDetails.features.join('\n'),
      originalPrice: orderData.price,
      orderDate: orderData.orderDate,
    });

    // Prepare listing data
    const listing: FBListingData = {
      title: orderData.productName.slice(0, 100), // FB title limit
      description,
      price,
      originalPrice: orderData.price.replace(/[^0-9.]/g, ''),
      condition: template.condition,
      category: template.category,
      pickupLocation: template.pickupLocation,
      images: productDetails.images,
      orderNumber: orderData.orderNumber,
      orderDate: orderData.orderDate,
      productUrl,
    };

    showFBButtonReady(button);

    // Show preview modal
    showPreviewModal(
      listing,
      async (finalListing) => {
        // Add to queue
        await fbQueue.add(finalListing);
        // Send message to background to process
        chrome.runtime.sendMessage({ type: 'FB_QUEUE_PROCESS' });
      },
      () => {
        // Cancelled
      }
    );
  } catch (error) {
    console.error('Failed to prepare FB listing:', error);
    showFBButtonError(button, 'Failed');
    showFBButtonReady(button);
  }
}

export function initFBMarketplace(): void {
  console.log('🛒 FB Marketplace listing feature initialized');
  injectFBButtons(handleListOnFB);
  setupFBMutationObserver(handleListOnFB);
}
```

**Step 2: Add FB init to main content script**

Add to `apps/extension/src/content/content.ts` after line 41:

```typescript
import { initFBMarketplace } from './fbMarketplace';
```

And in the `init` function after line 42:

```typescript
  initFBMarketplace();
```

**Step 3: Run typecheck**

```bash
cd apps/extension && bun run typecheck
```

**Step 4: Commit**

```bash
git add apps/extension/src/content/
git commit -m "feat: integrate FB Marketplace into content script"
```

---

## Task 8: Update Background Script for Queue Processing

**Files:**
- Modify: `apps/extension/src/background/background.ts`

**Step 1: Add queue message handling**

Add these imports at top of `apps/extension/src/background/background.ts`:

```typescript
import { fbQueue } from '@/lib';
import type { FBListingData } from '@/types';
```

Add this case in the switch statement (around line 17):

```typescript
    case 'FB_QUEUE_PROCESS':
      processNextFBItem();
      break;

    case 'FB_FORM_READY':
      // Form filler is ready to receive data
      handleFBFormReady(sender.tab?.id);
      break;

    case 'FB_LISTING_COMPLETE':
      // Listing was published
      handleFBListingComplete(message.itemId);
      break;

    case 'FB_LISTING_FAILED':
      handleFBListingFailed(message.itemId, message.error);
      break;
```

Add these functions after the existing code:

```typescript
async function processNextFBItem(): Promise<void> {
  const next = await fbQueue.getNext();
  if (!next) {
    console.log('[FBQueue] No items to process');
    return;
  }

  console.log('[FBQueue] Processing item:', next.id);
  await fbQueue.updateStatus(next.id, 'filling');

  // Store current item ID for the form filler
  await chrome.storage.local.set({ fb_current_item: next.id });

  // Open FB Marketplace create page
  const tab = await chrome.tabs.create({
    url: 'https://www.facebook.com/marketplace/create/item',
    active: true,
  });

  console.log('[FBQueue] Opened FB tab:', tab.id);
}

async function handleFBFormReady(tabId?: number): Promise<void> {
  if (!tabId) return;

  const current = await fbQueue.getCurrentFilling();
  if (!current) {
    console.log('[FBQueue] No item currently filling');
    return;
  }

  // Send listing data to the form filler
  chrome.tabs.sendMessage(tabId, {
    type: 'FB_FILL_FORM',
    listing: current.listing,
    itemId: current.id,
  });
}

async function handleFBListingComplete(itemId: string): Promise<void> {
  await fbQueue.updateStatus(itemId, 'done');
  await chrome.storage.local.remove('fb_current_item');

  // Broadcast update
  chrome.runtime.sendMessage({ type: 'FB_QUEUE_UPDATED' }).catch(() => {});

  // Process next item after delay
  setTimeout(() => processNextFBItem(), 2000);
}

async function handleFBListingFailed(itemId: string, error: string): Promise<void> {
  await fbQueue.updateStatus(itemId, 'failed', error);
  await chrome.storage.local.remove('fb_current_item');

  // Broadcast update
  chrome.runtime.sendMessage({ type: 'FB_QUEUE_UPDATED' }).catch(() => {});
}
```

**Step 2: Run typecheck**

```bash
cd apps/extension && bun run typecheck
```

**Step 3: Commit**

```bash
git add apps/extension/src/background/
git commit -m "feat: add FB queue processing to background script"
```

---

## Task 9: Create FB Form Filler Content Script

**Files:**
- Create: `apps/extension/src/content/fbFormFiller/formFiller.ts`
- Create: `apps/extension/src/content/fbFormFiller/index.ts`

**Step 1: Create form filler utilities**

```typescript
// apps/extension/src/content/fbFormFiller/formFiller.ts
import type { FBListingData, FBCondition } from '@/types';

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
  files.forEach((f) => dt.items.add(f));
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function fillFBForm(listing: FBListingData): Promise<void> {
  console.log('[FB FormFiller] Filling form with:', listing);

  // Wait for form to load
  await new Promise((r) => setTimeout(r, 2000));

  // Fill title
  try {
    const titleInput = await waitForElement('[aria-label="Title"]') as HTMLInputElement;
    setNativeValue(titleInput, listing.title);
    await new Promise((r) => setTimeout(r, 500));
  } catch (e) {
    console.warn('[FB FormFiller] Failed to fill title:', e);
  }

  // Fill price
  try {
    const priceInput = await waitForElement('[aria-label="Price"]') as HTMLInputElement;
    setNativeValue(priceInput, listing.price);
    await new Promise((r) => setTimeout(r, 500));
  } catch (e) {
    console.warn('[FB FormFiller] Failed to fill price:', e);
  }

  // Fill description
  try {
    const descInput = await waitForElement('[aria-label="Description"]') as HTMLTextAreaElement;
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
```

**Step 2: Create form filler entry**

```typescript
// apps/extension/src/content/fbFormFiller/index.ts
import { initializeErrorHandlers } from '@/lib';
import { fillFBForm } from './formFiller';
import type { FBListingData } from '@/types';

initializeErrorHandlers();

console.log('[FB FormFiller] Content script loaded on FB Marketplace');

// Notify background that we're ready
chrome.runtime.sendMessage({ type: 'FB_FORM_READY' });

// Listen for fill commands
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FB_FILL_FORM') {
    const listing = message.listing as FBListingData;
    const itemId = message.itemId as string;

    fillFBForm(listing)
      .then(() => {
        console.log('[FB FormFiller] Fill complete, waiting for user to publish');
        // Update status to waiting
        chrome.runtime.sendMessage({
          type: 'FB_LISTING_WAITING',
          itemId,
        });
      })
      .catch((error) => {
        console.error('[FB FormFiller] Fill failed:', error);
        chrome.runtime.sendMessage({
          type: 'FB_LISTING_FAILED',
          itemId,
          error: error.message,
        });
      });
  }
  return false;
});

// Watch for successful listing (URL changes to listing page)
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // Check if we're on a listing page (not create page)
    if (location.href.includes('/marketplace/item/')) {
      chrome.storage.local.get('fb_current_item').then(({ fb_current_item }) => {
        if (fb_current_item) {
          chrome.runtime.sendMessage({
            type: 'FB_LISTING_COMPLETE',
            itemId: fb_current_item,
          });
        }
      });
    }
  }
});

urlObserver.observe(document.body, { childList: true, subtree: true });
```

**Step 3: Run typecheck**

```bash
cd apps/extension && bun run typecheck
```

**Step 4: Commit**

```bash
git add apps/extension/src/content/fbFormFiller/
git commit -m "feat: add FB form filler content script"
```

---

## Task 10: Update Manifest for FB Content Script

**Files:**
- Modify: `apps/extension/public/manifest.json`

**Step 1: Add FB content script and host permissions**

Update `apps/extension/public/manifest.json`:

Add to `host_permissions` array:
```json
"*://*.facebook.com/*"
```

Add new content script entry to `content_scripts` array:
```json
{
  "matches": [
    "*://*.facebook.com/marketplace/create/*"
  ],
  "js": [
    "src/content/fbFormFiller/index.ts"
  ]
}
```

**Step 2: Run build to verify**

```bash
cd apps/extension && bun run build
```

**Step 3: Commit**

```bash
git add apps/extension/public/manifest.json
git commit -m "feat: add FB Marketplace to manifest"
```

---

## Task 11: Create Floating Queue Widget

**Files:**
- Create: `apps/extension/src/content/fbMarketplace/FloatingQueue.tsx`
- Create: `apps/extension/src/content/fbMarketplace/floatingQueue.ts`

**Step 1: Create floating queue component**

```typescript
// apps/extension/src/content/fbMarketplace/FloatingQueue.tsx
import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { fbQueue } from '@/lib';
import type { FBQueueItem, QueueItemStatus } from '@/types';

const STATUS_ICONS: Record<QueueItemStatus, string> = {
  pending: '○',
  filling: '●',
  waiting: '⏸',
  done: '✓',
  failed: '✗',
};

const STATUS_LABELS: Record<QueueItemStatus, string> = {
  pending: 'Pending',
  filling: 'Filling...',
  waiting: 'Waiting',
  done: 'Done',
  failed: 'Failed',
};

export function FloatingQueue() {
  const [minimized, setMinimized] = useState(false);
  const [queue, setQueue] = useState<FBQueueItem[]>([]);

  useEffect(() => {
    return fbQueue.subscribe(setQueue);
  }, []);

  const completed = queue.filter((i) => i.status === 'done').length;
  const total = queue.length;

  if (total === 0) return null;

  if (minimized) {
    return (
      <div style={styles.minimized} onClick={() => setMinimized(false)}>
        📦 {completed}/{total}
      </div>
    );
  }

  const handleRetry = async (id: string) => {
    await fbQueue.updateStatus(id, 'pending');
    chrome.runtime.sendMessage({ type: 'FB_QUEUE_PROCESS' });
  };

  const handleClear = async () => {
    if (confirm('Clear all items from queue?')) {
      await fbQueue.clear();
    }
  };

  const handlePause = () => {
    if (fbQueue.isPaused()) {
      fbQueue.resume();
      chrome.runtime.sendMessage({ type: 'FB_QUEUE_PROCESS' });
    } else {
      fbQueue.pause();
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>FB Marketplace Queue</span>
        <div style={styles.headerButtons}>
          <button style={styles.iconBtn} onClick={() => setMinimized(true)}>─</button>
          <button style={styles.iconBtn} onClick={handleClear}>✕</button>
        </div>
      </div>
      <div style={styles.list}>
        {queue.slice(0, 5).map((item) => (
          <div key={item.id} style={styles.item}>
            <span style={styles.status}>{STATUS_ICONS[item.status]}</span>
            <span style={styles.name}>{item.listing.title.slice(0, 25)}...</span>
            <span style={styles.statusLabel}>
              {item.status === 'failed' ? (
                <button style={styles.retryBtn} onClick={() => handleRetry(item.id)}>
                  Retry
                </button>
              ) : (
                STATUS_LABELS[item.status]
              )}
            </span>
          </div>
        ))}
        {queue.length > 5 && (
          <div style={styles.more}>+{queue.length - 5} more</div>
        )}
      </div>
      <div style={styles.footer}>
        <span>{completed}/{total} completed</span>
        <button style={styles.pauseBtn} onClick={handlePause}>
          {fbQueue.isPaused() ? 'Resume' : 'Pause'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '300px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    zIndex: 999999,
    overflow: 'hidden',
  },
  minimized: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    padding: '12px 16px',
    background: '#1877F2',
    color: 'white',
    borderRadius: '24px',
    fontWeight: 500,
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(24,119,242,0.4)',
    zIndex: 999999,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #eee',
  },
  title: {
    fontWeight: 600,
    fontSize: '14px',
  },
  headerButtons: {
    display: 'flex',
    gap: '8px',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px',
    color: '#666',
  },
  list: {
    maxHeight: '200px',
    overflow: 'auto',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid #f5f5f5',
    gap: '10px',
  },
  status: {
    fontSize: '12px',
  },
  name: {
    flex: 1,
    fontSize: '13px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  statusLabel: {
    fontSize: '12px',
    color: '#666',
  },
  retryBtn: {
    background: '#1877F2',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '11px',
    cursor: 'pointer',
  },
  more: {
    padding: '8px 16px',
    fontSize: '12px',
    color: '#666',
    textAlign: 'center',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderTop: '1px solid #eee',
    fontSize: '13px',
  },
  pauseBtn: {
    background: '#f0f0f0',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '12px',
    cursor: 'pointer',
  },
};
```

**Step 2: Create mount utility**

```typescript
// apps/extension/src/content/fbMarketplace/floatingQueue.ts
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
```

**Step 3: Add queue widget to content script**

Add to `apps/extension/src/content/fbMarketplace/index.ts`:

```typescript
import { showFloatingQueue } from './floatingQueue';
```

And in `initFBMarketplace` function:

```typescript
  // Show floating queue widget
  showFloatingQueue();
```

**Step 4: Run typecheck**

```bash
cd apps/extension && bun run typecheck
```

**Step 5: Commit**

```bash
git add apps/extension/src/content/fbMarketplace/
git commit -m "feat: add floating queue widget"
```

---

## Task 12: Create Options Page

**Files:**
- Create: `apps/extension/src/options/options.html`
- Create: `apps/extension/src/options/options.tsx`
- Create: `apps/extension/src/options/main.tsx`
- Modify: `apps/extension/public/manifest.json`
- Modify: `apps/extension/vite.config.ts`

**Step 1: Create options HTML**

```html
<!-- apps/extension/src/options/options.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Amazon Order Wizard - Settings</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

**Step 2: Create options main entry**

```typescript
// apps/extension/src/options/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Options } from './options';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
);
```

**Step 3: Create options component**

```typescript
// apps/extension/src/options/options.tsx
import React, { useState, useEffect } from 'react';
import { getTemplate, saveTemplate } from '@/lib';
import { DEFAULT_TEMPLATE, FB_CONDITION_LABELS, FB_CATEGORY_LABELS, type FBListingTemplate, type FBCondition, type FBCategory } from '@/types';

export function Options() {
  const [template, setTemplate] = useState<FBListingTemplate>(DEFAULT_TEMPLATE);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getTemplate().then(setTemplate);
  }, []);

  const handleSave = async () => {
    await saveTemplate(template);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setTemplate(DEFAULT_TEMPLATE);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">
          FB Marketplace Listing Settings
        </h1>

        <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
          {/* Discount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Selling Price (% of original)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="10"
                max="100"
                value={template.discountPercent}
                onChange={(e) => setTemplate({ ...template, discountPercent: Number(e.target.value) })}
                className="flex-1"
              />
              <span className="text-lg font-semibold w-16">{template.discountPercent}%</span>
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Condition
            </label>
            <select
              value={template.condition}
              onChange={(e) => setTemplate({ ...template, condition: e.target.value as FBCondition })}
              className="w-full border rounded-lg p-3"
            >
              {Object.entries(FB_CONDITION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Category
            </label>
            <select
              value={template.category}
              onChange={(e) => setTemplate({ ...template, category: e.target.value as FBCategory })}
              className="w-full border rounded-lg p-3"
            >
              {Object.entries(FB_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Pickup Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Pickup Location
            </label>
            <input
              type="text"
              value={template.pickupLocation}
              onChange={(e) => setTemplate({ ...template, pickupLocation: e.target.value })}
              placeholder="Leave empty to use your FB location"
              className="w-full border rounded-lg p-3"
            />
          </div>

          {/* Include Order Link */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="includeOrderLink"
              checked={template.includeOrderLink}
              onChange={(e) => setTemplate({ ...template, includeOrderLink: e.target.checked })}
              className="w-5 h-5"
            />
            <label htmlFor="includeOrderLink" className="text-sm text-gray-700">
              Include Amazon order link in description
            </label>
          </div>

          {/* Description Template */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description Template
            </label>
            <textarea
              value={template.descriptionTemplate}
              onChange={(e) => setTemplate({ ...template, descriptionTemplate: e.target.value })}
              rows={8}
              className="w-full border rounded-lg p-3 font-mono text-sm"
            />
            <p className="mt-2 text-xs text-gray-500">
              Variables: {'{productName}'}, {'{productDescription}'}, {'{originalPrice}'}, {'{sellingPrice}'}, {'{orderDate}'}, {'{condition}'}
            </p>
          </div>

          {/* Buttons */}
          <div className="flex justify-between pt-4">
            <button
              onClick={handleReset}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Reset to Default
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {saved ? '✓ Saved!' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Update manifest**

Add to `apps/extension/public/manifest.json`:

```json
"options_page": "src/options/options.html"
```

**Step 5: Update vite config**

Update `apps/extension/vite.config.ts` to include options page:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './public/manifest.json';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        options: 'src/options/options.html',
      },
    },
  },
});
```

**Step 6: Run build**

```bash
cd apps/extension && bun run build
```

**Step 7: Commit**

```bash
git add apps/extension/src/options/ apps/extension/public/manifest.json apps/extension/vite.config.ts
git commit -m "feat: add Options page for FB template settings"
```

---

## Task 13: Final Integration and Testing

**Step 1: Run all checks**

```bash
just check
```

**Step 2: Build extension**

```bash
just build
```

**Step 3: Manual testing checklist**

1. Load extension in Chrome (chrome://extensions)
2. Go to Amazon order history
3. Verify "List on FB" button appears next to "Save Order"
4. Click "List on FB" on an order
5. Verify preview modal shows with product details
6. Confirm listing
7. Verify FB Marketplace page opens and form is filled
8. Check floating queue widget appears
9. Test Options page (right-click extension icon > Options)
10. Modify template settings and verify they apply

**Step 4: Commit final integration**

```bash
git add -A
git commit -m "feat: complete FB Marketplace listing feature"
```

---

## Summary

| Task | Description | Files Changed |
|------|-------------|---------------|
| 1 | Types & Schemas | types/fbListing.ts, schemas/fbListing.ts |
| 2 | FB Queue Manager | lib/fbQueue.ts |
| 3 | Template Storage | lib/fbTemplate.ts |
| 4 | Product Scraper | content/fbMarketplace/productScraper.ts |
| 5 | Button Injector | content/fbMarketplace/injector.ts |
| 6 | Preview Modal | content/fbMarketplace/PreviewModal.tsx |
| 7 | Content Entry | content/fbMarketplace/index.ts |
| 8 | Background Queue | background/background.ts |
| 9 | Form Filler | content/fbFormFiller/*.ts |
| 10 | Manifest Update | public/manifest.json |
| 11 | Floating Queue | content/fbMarketplace/FloatingQueue.tsx |
| 12 | Options Page | options/*.tsx |
| 13 | Final Testing | - |

import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { applyTemplate, getTemplate } from '@/lib';
import { changeListingDraft } from '@/lib/listingDraft';
import type { FBListingData, ProductDetails } from '@/types';
import { scrapeOrderData } from '../scraper';
import {
  injectFBButtons,
  setupFBMutationObserver,
  showFBButtonError,
  showFBButtonLoading,
  showFBButtonReady,
} from './injector';
import { showPreviewModal } from './previewModal';
import { scrapeProductPage } from './productScraper';

async function handleListOnFB(
  ctx: ContentScriptContext,
  orderCard: Element,
  button: HTMLButtonElement,
): Promise<void> {
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
    let productDetails: ProductDetails = {
      description: '',
      features: [],
      images: [orderData.productImage],
    };
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

    // Use current Amazon price if available, otherwise fall back to order price
    const basePrice = productDetails.currentPrice || orderData.price;

    // Apply template
    const { description, price } = applyTemplate(template, {
      productName: orderData.productName,
      productDescription: productDetails.description || productDetails.features.join('\n'),
      originalPrice: basePrice,
      orderDate: orderData.orderDate,
      orderNumber: orderData.orderNumber,
    });

    // Prepare listing data - truncate title smartly at comma/space
    const truncateTitle = (name: string, maxLen: number): string => {
      if (name.length <= maxLen) {
        return name;
      }
      const truncated = name.slice(0, maxLen);
      // Try to find a comma or space to break at
      const lastComma = truncated.lastIndexOf(',');
      const lastSpace = truncated.lastIndexOf(' ');
      const breakPoint = Math.max(lastComma, lastSpace);
      if (breakPoint > maxLen * 0.5) {
        return truncated.slice(0, breakPoint).trim();
      }
      return truncated.trim();
    };

    const listing: FBListingData = {
      title: truncateTitle(orderData.productName, 80),
      description,
      price,
      originalPrice: basePrice.replace(/[^0-9.]/g, ''),
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
      ctx,
      listing,
      button,
      (finalListing) => {
        void changeListingDraft({ kind: 'save', listing: finalListing })
          .then(() => chrome.runtime.sendMessage({ type: 'OPEN_FB_MARKETPLACE' }))
          .then((result: { ok?: boolean; error?: string }) => {
            if (!result?.ok) {
              throw new Error(result?.error ?? 'Could not open Marketplace');
            }
          })
          .catch((error: unknown) => {
            console.error('Could not open saved listing:', error);
            showFBButtonError(button, 'Could not open listing');
          });
      },
      () => {
        // Cancelled
      },
    );
  } catch (error) {
    console.error('Failed to prepare FB listing:', error);
    showFBButtonError(button, 'Failed');
    showFBButtonReady(button);
  }
}

export function initFBMarketplace(ctx: ContentScriptContext): void {
  console.info('FB Marketplace listing feature initialized');
  const handleClick = (card: Element, button: HTMLButtonElement) =>
    handleListOnFB(ctx, card, button);
  injectFBButtons(handleClick);
  setupFBMutationObserver(handleClick);
}

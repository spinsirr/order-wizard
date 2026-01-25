import { scrapeOrderData } from '../scraper';
import { scrapeProductPage } from './productScraper';
import {
  injectFBButtons,
  setupFBMutationObserver,
  showFBButtonLoading,
  showFBButtonReady,
  showFBButtonError,
} from './injector';
import { showPreviewModal } from './previewModal';
import { getTemplate, applyTemplate } from '@/lib';
import type { FBListingData } from '@/types';

const FB_PENDING_LISTING_KEY = 'fb_pending_listing';

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

    // Prepare listing data - truncate title smartly at comma/space
    const truncateTitle = (name: string, maxLen: number): string => {
      if (name.length <= maxLen) return name;
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
        // Store listing and open FB Marketplace
        await chrome.storage.local.set({ [FB_PENDING_LISTING_KEY]: finalListing });
        chrome.runtime.sendMessage({ type: 'OPEN_FB_MARKETPLACE' });
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
  console.log('FB Marketplace listing feature initialized');
  injectFBButtons(handleListOnFB);
  setupFBMutationObserver(handleListOnFB);
}

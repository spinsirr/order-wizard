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
import { showFloatingQueue } from './floatingQueue';
import { getTemplate, applyTemplate, fbQueue } from '@/lib';
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
  console.log('FB Marketplace listing feature initialized');
  showFloatingQueue();
  injectFBButtons(handleListOnFB);
  setupFBMutationObserver(handleListOnFB);
}

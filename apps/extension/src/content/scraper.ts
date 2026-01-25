import { type ScrapedOrderData, ScrapedOrderDataSchema } from '@/schemas';

/**
 * Scrape order data from Amazon order card
 */
export function scrapeOrderData(orderCard: Element): ScrapedOrderData {
  console.log('🔍 Scraping order card:', orderCard);

  // Extract order number - it's in two spans within .yohtmlc-order-id
  const orderIdContainer = orderCard.querySelector('.yohtmlc-order-id');
  const orderIdSpans = orderIdContainer?.querySelectorAll('span');
  let orderNumber = '';
  if (orderIdSpans && orderIdSpans.length >= 2) {
    // Second span contains the actual order number
    orderNumber = orderIdSpans[1].textContent?.trim() || '';
  }
  console.log('📋 Order Number:', orderNumber);

  // Extract product name
  const productNameElement = orderCard.querySelector('.yohtmlc-product-title a');
  const productName = productNameElement?.textContent?.trim() || '';
  console.log('📦 Product Name:', productName);

  // Extract order date - find the column with "Order placed" label
  let orderDate = '';
  const headerItems = orderCard.querySelectorAll('.order-header__header-list-item');
  for (const item of headerItems) {
    const label = item.querySelector('.a-color-secondary.a-text-caps');
    if (label?.textContent?.trim().toLowerCase() === 'order placed') {
      // The date is in the next .a-row div
      const dateElement = item.querySelector('.a-size-base');
      if (dateElement) {
        orderDate = dateElement.textContent?.trim() || '';
        break;
      }
    }
  }
  console.log('📅 Order Date:', orderDate);

  // Extract product image - prefer high-res version
  const productImageElement = orderCard.querySelector('.product-image img') as HTMLImageElement;
  let productImage = productImageElement?.dataset.aHires || productImageElement?.src || '';
  // Replace small size parameters with high-res _AC_SL1500_ (1500px)
  // Thumbnail: ._AC_US40_. or ._SX300_SY300_. -> ._AC_SL1500_.
  if (productImage) {
    productImage = productImage.replace(/\._[^.]+_\.(?=jpg|png|gif|webp|jpeg)/i, '._AC_SL1500_.');
  }
  console.log('🖼️ Product Image:', productImage);

  // Extract price - find the column with "Total" label
  let price = '';
  for (const item of headerItems) {
    const label = item.querySelector('.a-color-secondary.a-text-caps');
    if (label?.textContent?.trim().toLowerCase() === 'total') {
      // The price is in the next .a-row div
      const priceElement = item.querySelector('.a-size-base');
      if (priceElement) {
        price = priceElement.textContent?.trim() || '';
        break;
      }
    }
  }
  console.log('💰 Price:', price);

  const rawData = {
    orderNumber,
    productName,
    orderDate,
    productImage,
    price,
  };

  console.log('📊 Raw scraped data:', rawData);

  // Validate with Zod schema - will throw if invalid
  return ScrapedOrderDataSchema.parse(rawData);
}

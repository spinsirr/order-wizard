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

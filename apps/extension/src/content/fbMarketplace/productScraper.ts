import type { ProductDetails } from '@/types';

export async function scrapeProductPage(productUrl: string): Promise<ProductDetails> {
  // Fetch via background script to avoid CORS issues
  const result = await chrome.runtime.sendMessage({
    type: 'FETCH_URL',
    url: productUrl,
  });

  if (result.error) {
    throw new Error(`Failed to fetch product page: ${result.error}`);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(result.html, 'text/html');

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
  const seenImageIds = new Set<string>();

  // Helper to extract image ID from Amazon URL (e.g., "71eG75FTJJL" from ".../I/71eG75FTJJL._AC_SL1500_.jpg")
  const getImageId = (url: string): string | null => {
    const match = url.match(/\/I\/([A-Za-z0-9+_-]+)\./);
    return match ? match[1] : null;
  };

  // Helper to add image if not duplicate
  const addImage = (url: string): boolean => {
    const imageId = getImageId(url);
    if (imageId && seenImageIds.has(imageId)) return false;
    if (imageId) seenImageIds.add(imageId);
    images.push(url);
    return true;
  };

  // Helper to get high-res URL by removing/replacing size constraints
  const toHighRes = (url: string): string => {
    // Match various Amazon thumbnail patterns and replace with high-res
    // Examples: ._AC_US40_. ._SS40_. ._SX38_SY50_. ._AC_SR38,50_. ._CR0,0,38,50_.
    return url.replace(/\._[A-Z0-9_,]+_\.(?=jpg|png|webp|gif)/i, '._AC_SL1500_.');
  };

  // 1. Try data-a-dynamic-image attribute (JSON with all image sizes)
  const landingImage = doc.querySelector('#landingImage');
  const dynamicImageData = landingImage?.getAttribute('data-a-dynamic-image');
  if (dynamicImageData) {
    try {
      const imageMap = JSON.parse(dynamicImageData) as Record<string, [number, number]>;
      // Sort by largest dimension and get the biggest
      const sortedUrls = Object.entries(imageMap).sort(
        ([, a], [, b]) => Math.max(b[0], b[1]) - Math.max(a[0], a[1])
      );
      if (sortedUrls[0]) {
        addImage(sortedUrls[0][0]);
      }
    } catch {
      // JSON parse failed, continue to fallbacks
    }
  }

  // 2. Try data-old-hires attribute (direct high-res URL)
  const oldHires = landingImage?.getAttribute('data-old-hires');
  if (oldHires) {
    addImage(oldHires);
  }

  // 3. Try colorImages from script tags (Amazon embeds image data in JS)
  const scripts = doc.querySelectorAll('script:not([src])');
  for (const script of scripts) {
    const content = script.textContent || '';
    // Check if this script contains colorImages data
    if (content.includes("'colorImages'") || content.includes('"colorImages"')) {
      // Extract all hiRes URLs directly with regex (more reliable than JSON parsing)
      const hiResMatches = content.matchAll(/"hiRes"\s*:\s*"([^"]+)"/g);
      for (const match of hiResMatches) {
        const url = match[1];
        if (url?.startsWith('http')) {
          addImage(url);
        }
      }
      // Also try "large" URLs as fallback
      if (images.length === 0) {
        const largeMatches = content.matchAll(/"large"\s*:\s*"([^"]+)"/g);
        for (const match of largeMatches) {
          const url = match[1];
          if (url?.startsWith('http')) {
            addImage(url);
          }
        }
      }
    }
  }

  // 4. Fallback: Main image src with high-res conversion
  const mainImage = landingImage as HTMLImageElement | null;
  if (mainImage?.src && images.length === 0) {
    addImage(toHighRes(mainImage.src));
  }

  // 5. Thumbnail images (for alternate views)
  const thumbnails = doc.querySelectorAll('#altImages img');
  for (const thumb of thumbnails) {
    const img = thumb as HTMLImageElement;
    if (img.src && !img.src.includes('play-button')) {
      addImage(toHighRes(img.src));
    }
  }

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

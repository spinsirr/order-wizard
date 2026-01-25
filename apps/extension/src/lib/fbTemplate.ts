import {
  DEFAULT_TEMPLATE,
  type FBListingTemplate,
  FB_CONDITION_LABELS,
  PriceRounding,
} from '@/types';
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

function roundPrice(price: number, rounding: PriceRounding): number {
  switch (rounding) {
    case PriceRounding.Nearest5:
      return Math.round(price / 5) * 5;
    case PriceRounding.Nearest10:
      return Math.round(price / 10) * 10;
    case PriceRounding.None:
    default:
      return price;
  }
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
  const discountedPrice = priceNum * (template.discountPercent / 100);
  const roundedPrice = roundPrice(discountedPrice, template.priceRounding);
  const sellingPrice =
    template.priceRounding === PriceRounding.None
      ? roundedPrice.toFixed(2)
      : roundedPrice.toString();

  const description = template.descriptionTemplate
    .replace(/{productName}/g, data.productName)
    .replace(/{productDescription}/g, data.productDescription)
    .replace(/{originalPrice}/g, data.originalPrice.replace(/[^0-9.]/g, ''))
    .replace(/{sellingPrice}/g, sellingPrice)
    .replace(/{orderDate}/g, data.orderDate)
    .replace(/{condition}/g, FB_CONDITION_LABELS[template.condition]);

  return { description, price: sellingPrice };
}

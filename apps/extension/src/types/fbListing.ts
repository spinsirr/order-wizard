import type { z } from 'zod';
import type {
  FBListingDataSchema,
  FBListingTemplateSchema,
  ProductDetailsSchema,
} from '@/schemas/fbListing';
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

export const PriceRounding = {
  None: 'none',
  Nearest5: 'nearest_5',
  Nearest10: 'nearest_10',
} as const;

export type PriceRounding = (typeof PriceRounding)[keyof typeof PriceRounding];

export const PRICE_ROUNDING_LABELS: Record<PriceRounding, string> = {
  [PriceRounding.None]: 'No rounding',
  [PriceRounding.Nearest5]: 'Round to nearest $5',
  [PriceRounding.Nearest10]: 'Round to nearest $10',
};

export const FB_CATEGORY_LABELS: Record<FBCategory, string> = {
  [FBCategory.General]: 'General',
  [FBCategory.Electronics]: 'Electronics',
  [FBCategory.Clothing]: 'Clothing & Accessories',
  [FBCategory.HomeGarden]: 'Home & Garden',
  [FBCategory.ToysGames]: 'Toys & Games',
  [FBCategory.Sports]: 'Sports & Outdoors',
};

export type FBListingTemplate = z.infer<typeof FBListingTemplateSchema>;

export type FBListingData = z.infer<typeof FBListingDataSchema>;

export type ProductDetails = z.infer<typeof ProductDetailsSchema>;

export const DEFAULT_TEMPLATE: FBListingTemplate = {
  discountPercent: 70,
  priceRounding: PriceRounding.Nearest5,
  condition: FBCondition.New,
  category: FBCategory.General,
  pickupLocation: '',
  includeOrderLink: false,
  descriptionTemplate: `{productName}

{productDescription}

Condition: {condition}

Pickup only. Message me if interested!`,
};

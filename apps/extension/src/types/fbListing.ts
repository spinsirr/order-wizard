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
  priceRounding: PriceRounding;
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

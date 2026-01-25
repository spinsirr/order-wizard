import { z } from 'zod';
import { FBCondition, FBCategory } from '@/types';

export const FBListingTemplateSchema = z.object({
  discountPercent: z.number().min(0).max(100),
  condition: z.enum(FBCondition),
  category: z.enum(FBCategory),
  pickupLocation: z.string(),
  includeOrderLink: z.boolean(),
  descriptionTemplate: z.string().min(1),
});

export const FBListingDataSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  price: z.string(),
  originalPrice: z.string(),
  condition: z.enum(FBCondition),
  category: z.enum(FBCategory),
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

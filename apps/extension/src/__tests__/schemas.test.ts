import { describe, it, expect } from 'vitest';
import { OrderSchema, ScrapedOrderDataSchema } from '../schemas/order';
import { FBListingTemplateSchema } from '../schemas/fbListing';
import { PriceRounding, FBCondition, FBCategory } from '../types';

describe('OrderSchema', () => {
  const validOrder = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: 'user-123',
    orderNumber: '111-0000000-0000000',
    productName: 'Test Product',
    orderDate: 'January 1, 2025',
    productImage: 'https://example.com/img.jpg',
    price: '$29.99',
    status: 'uncommented',
  };

  it('accepts a valid order', () => {
    const result = OrderSchema.safeParse(validOrder);
    expect(result.success).toBe(true);
  });

  it('accepts order with optional note', () => {
    const result = OrderSchema.safeParse({ ...validOrder, note: 'some note' });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const { orderNumber: _, ...incomplete } = validOrder;
    const result = OrderSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID', () => {
    const result = OrderSchema.safeParse({ ...validOrder, id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = OrderSchema.safeParse({ ...validOrder, status: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects empty userId', () => {
    const result = OrderSchema.safeParse({ ...validOrder, userId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid image URL', () => {
    const result = OrderSchema.safeParse({ ...validOrder, productImage: 'not-a-url' });
    expect(result.success).toBe(false);
  });
});

describe('ScrapedOrderDataSchema', () => {
  const validData = {
    orderNumber: '111-0000000-0000000',
    productName: 'Test Product',
    orderDate: 'January 1, 2025',
    productImage: 'https://example.com/img.jpg',
    price: '$29.99',
  };

  it('accepts valid scraped data', () => {
    const result = ScrapedOrderDataSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('rejects empty order number', () => {
    const result = ScrapedOrderDataSchema.safeParse({ ...validData, orderNumber: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty product name', () => {
    const result = ScrapedOrderDataSchema.safeParse({ ...validData, productName: '' });
    expect(result.success).toBe(false);
  });
});

describe('FBListingTemplateSchema', () => {
  const validTemplate = {
    discountPercent: 70,
    priceRounding: PriceRounding.Nearest5,
    condition: FBCondition.New,
    category: FBCategory.General,
    pickupLocation: '123 Main St',
    includeOrderLink: false,
    descriptionTemplate: 'A listing for {productName}',
  };

  it('accepts a valid template', () => {
    const result = FBListingTemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
  });

  it('rejects discount below 0', () => {
    const result = FBListingTemplateSchema.safeParse({ ...validTemplate, discountPercent: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects discount above 100', () => {
    const result = FBListingTemplateSchema.safeParse({ ...validTemplate, discountPercent: 101 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid condition', () => {
    const result = FBListingTemplateSchema.safeParse({ ...validTemplate, condition: 'broken' });
    expect(result.success).toBe(false);
  });

  it('rejects empty description template', () => {
    const result = FBListingTemplateSchema.safeParse({ ...validTemplate, descriptionTemplate: '' });
    expect(result.success).toBe(false);
  });

  it('accepts 0 and 100 as edge discount values', () => {
    expect(FBListingTemplateSchema.safeParse({ ...validTemplate, discountPercent: 0 }).success).toBe(true);
    expect(FBListingTemplateSchema.safeParse({ ...validTemplate, discountPercent: 100 }).success).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { applyTemplate } from '../lib/fbTemplate';
import { PriceRounding, FBCondition, DEFAULT_TEMPLATE } from '../types';

describe('applyTemplate', () => {
  const baseData = {
    productName: 'Sony WH-1000XM5',
    productDescription: 'Noise cancelling headphones',
    originalPrice: '$349.99',
    orderDate: 'January 15, 2025',
  };

  it('applies discount and rounds to nearest 5', () => {
    const template = {
      ...DEFAULT_TEMPLATE,
      discountPercent: 70,
      priceRounding: PriceRounding.Nearest5,
    };
    const result = applyTemplate(template, baseData);
    // 349.99 * 0.7 = 244.993 → round to nearest 5 = 245
    expect(result.price).toBe('245');
  });

  it('applies discount and rounds to nearest 10', () => {
    const template = {
      ...DEFAULT_TEMPLATE,
      discountPercent: 70,
      priceRounding: PriceRounding.Nearest10,
    };
    const result = applyTemplate(template, baseData);
    // 349.99 * 0.7 = 244.993 → round to nearest 10 = 240
    expect(result.price).toBe('240');
  });

  it('no rounding keeps two decimal places', () => {
    const template = {
      ...DEFAULT_TEMPLATE,
      discountPercent: 70,
      priceRounding: PriceRounding.None,
    };
    const result = applyTemplate(template, baseData);
    // 349.99 * 0.7 = 244.993
    expect(result.price).toBe('244.99');
  });

  it('substitutes all template variables', () => {
    const template = {
      ...DEFAULT_TEMPLATE,
      descriptionTemplate:
        'Name: {productName}\nDesc: {productDescription}\nOrig: ${originalPrice}\nSell: ${sellingPrice}\nDate: {orderDate}\nCond: {condition}',
      condition: FBCondition.UsedLikeNew,
    };
    const result = applyTemplate(template, baseData);
    expect(result.description).toContain('Name: Sony WH-1000XM5');
    expect(result.description).toContain('Desc: Noise cancelling headphones');
    expect(result.description).toContain('Orig: $349.99');
    expect(result.description).toContain('Date: January 15, 2025');
    expect(result.description).toContain('Cond: Used - Like New');
  });

  it('handles 100% discount (full price)', () => {
    const template = {
      ...DEFAULT_TEMPLATE,
      discountPercent: 100,
      priceRounding: PriceRounding.None,
    };
    const result = applyTemplate(template, baseData);
    expect(result.price).toBe('349.99');
  });

  it('handles 0% discount (free)', () => {
    const template = {
      ...DEFAULT_TEMPLATE,
      discountPercent: 0,
      priceRounding: PriceRounding.None,
    };
    const result = applyTemplate(template, baseData);
    expect(result.price).toBe('0.00');
  });

  it('handles price with no dollar sign', () => {
    const result = applyTemplate(DEFAULT_TEMPLATE, {
      ...baseData,
      originalPrice: '100.00',
    });
    // 100 * 0.7 = 70 → nearest 5 = 70
    expect(result.price).toBe('70');
  });
});

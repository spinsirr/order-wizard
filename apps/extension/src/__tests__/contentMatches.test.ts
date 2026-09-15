import { describe, expect, it } from 'vitest';
import { AMAZON_ORDER_PAGE_MATCHES } from '../constants';

describe('Amazon order page content script matches', () => {
  it('includes the first Your Orders route', () => {
    expect(AMAZON_ORDER_PAGE_MATCHES).toContain('*://*.amazon.com/gp/css/order-history*');
  });
});

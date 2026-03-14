import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': '/Users/spenc/order-wizard/apps/extension/src',
    },
  },
  test: {
    globals: true,
  },
});

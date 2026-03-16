import { readFileSync } from 'node:fs';
import { defineConfig } from 'wxt';

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
);

export default defineConfig({
  srcDir: 'src',
  entrypointsDir: 'entrypoints',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Amazon Order Wizard',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAn1If74i2NtupX1+aGXa5dNFW1jvArO6WL7xgNFkLp7QWkDmbLntsMWPIVryUHIWs/Bg8rDpAshUg5+OEz7LH96Sbj8vzCw7kfqYUn6gykcfsgnnLXKywV9Wc5PrjYKlscIOlRx5louTVHx61w2FDhkuzLE2x+6iajGTtaRyi2vcxfaMrcn5C3tZfcOBB+aaOhF+JyvWPJauIqe29Z/XKN53QFOwDjtOV1a+N/p59UtKzYkbUJmCj1dMs46mBJeFJVosghjMvPQk70OL3g68xJJWSqH7dRyYjWX+ONM8W2WU/PMC+MKt+GJqXnMFKXAyQMasQhHsqJB41/B0dYiNnGwIDAQAB',
    version,
    description: 'Manage and track your Amazon orders',
    permissions: ['storage', 'activeTab', 'sidePanel', 'identity'],
    host_permissions: [
      '*://*.amazon.com/*',
      '*://*.facebook.com/*',
      'https://*.amazoncognito.com/*',
      'https://cognito-idp.us-west-1.amazonaws.com/*',
    ],
    action: {
      default_title: 'Open Order Wizard',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
  vite: () => ({
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  }),
});

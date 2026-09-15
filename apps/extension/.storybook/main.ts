import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
  stories: ['../src/stories/**/*.stories.tsx'],
  staticDirs: ['../public'],
  framework: '@storybook/react-vite',
  core: { disableTelemetry: true },
  async viteFinal(config) {
    return mergeConfig(config, {
      envDir: false,
      resolve: {
        alias: [
          // Mock only the I/O boundary; render the actual list, filters, and cards.
          {
            find: '@/hooks/useOrders',
            replacement: fileURLToPath(new URL('../src/stories/mockOrders.tsx', import.meta.url)),
          },
          { find: '@', replacement: fileURLToPath(new URL('../src', import.meta.url)) },
        ],
      },
    });
  },
};

export default config;
